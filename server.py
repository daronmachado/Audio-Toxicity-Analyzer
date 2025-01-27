import os
import tempfile
import csv
from flask import Flask, request, redirect, render_template, jsonify, send_from_directory, session
from werkzeug.utils import secure_filename
import whisper
import torch
from transformers import pipeline, BertTokenizer
import requests
import subprocess
from bson import ObjectId
from flask_cors import CORS
from datetime import datetime, timezone
from mongoengine import connect, Document, StringField, ListField, ReferenceField, EmbeddedDocument, EmbeddedDocumentField, DateTimeField

from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Access variables
PERSPECTIVE_API_KEY = os.getenv("PERSPECTIVE_API_KEY")
SECRET_KEY = os.getenv("SECRET_KEY")

# Configuration
UPLOAD_FOLDER = tempfile.gettempdir()
API_URL = "https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze"


# Flask app
app = Flask(__name__, static_folder="static")
CORS(app)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.secret_key = SECRET_KEY  # Session secret key for Flask

## MONGODB SETUP

try:
    connect(db="AudioToxicity", host="mongodb://127.0.0.1:27017")
    print("Connected to MongoDB successfully!")
except ConnectionError as e:
    print(f"Failed to connect to MongoDB: {e}")

# User model definition
class AnalysisLog(Document):
    audio_file_name = StringField(required=True)
    model_used = StringField(required=True)
    transcribed_text = StringField()
    toxic_words = ListField(StringField())
    results = StringField()
    toxicity = StringField()  # Add the toxicity field
    username = ReferenceField('User', required=True)
    created_at = StringField()

class User(Document):
    username = StringField(required=True, unique=True)
    password = StringField(required=True)
    user_logs = ListField(ReferenceField(AnalysisLog))
## MONGODB SETUP

# Load models
device = 0 if torch.cuda.is_available() else -1  # Use GPU if available, else CPU
bert_classifier = pipeline("text-classification", model="unitary/toxic-bert", return_all_scores=True, device=device)
whisper_models = {
    "bert": whisper.load_model("base"),
    "perspective": whisper.load_model("base"),
}

# Initialize BERT tokenizer
tokenizer = BertTokenizer.from_pretrained("bert-base-uncased")

# Load toxic words from CSV
def load_toxic_words():
    toxic_words = set()
    with open("toxic_words.csv", "r") as file:
        reader = csv.reader(file)
        for row in reader:
            for word in row:
                toxic_words.add(word.strip().lower())
    return toxic_words

toxic_words_set = load_toxic_words()

# Transcribe audio
def transcribe_audio(file_path, model_type="bert"):
    whisper_model = whisper_models[model_type]
    result = whisper_model.transcribe(file_path)
    return result["text"]

# Analyze text with BERT
def analyze_text_with_bert(text):
    tokens = tokenizer.encode(text, add_special_tokens=True)
    if len(tokens) > 512:
        tokens = tokens[:512]  # Truncate to 512 tokens
    truncated_text = tokenizer.decode(tokens, skip_special_tokens=True)
    results = bert_classifier(truncated_text)

    # Extract and normalize scores
    scores = {r["label"]: r["score"] for r in results[0]}
    total_score = sum(scores.values())
    normalized_scores = {label: round((score / total_score) * 100, 2) for label, score in scores.items()}

    return normalized_scores


# Analyze text with Perspective API
def analyze_text_with_perspective(text):
    body = {
        "comment": {"text": text},
        "languages": ["en"],
        "requestedAttributes": {
            "TOXICITY": {},
            "SEVERE_TOXICITY": {},
            "INSULT": {},
            "THREAT": {},
        },
    }
    response = requests.post(f"{API_URL}?key={PERSPECTIVE_API_KEY}", json=body)
    return response.json()

# Find toxic words in text
def find_toxic_words(text):
    text_words = set(text.lower().split())
    return list(text_words.intersection(toxic_words_set))

@app.route("/webAnalyze", methods=["POST"])
def analyze_webSpeech():
    text = request.data.decode('utf-8')
    results = analyze_text_with_perspective(text)
    response_data = {
        "results" : results
    }
    return jsonify(response_data)


# Endpoint to analyze audio
@app.route("/analyze", methods=["POST"])
def analyze_audio():
    status = ""
    if "audioFile" not in request.files:
        return jsonify({"error": "No audio file uploaded"}), 400
    model = request.form.get("model")
    if model not in ["bert", "perspective"]:
        return jsonify({"error": "Invalid model selected"}), 400

    # Save uploaded file
    audio_file = request.files["audioFile"]
    filename = secure_filename(audio_file.filename)
    file_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    audio_file.save(file_path)
    
    try:
        # Transcribe audio
        transcribed_text = transcribe_audio(file_path, model_type=model)

        # Analyze text
        toxic_words = find_toxic_words(transcribed_text)
        if model == "bert":
            results = analyze_text_with_bert(transcribed_text)
            response_data = {
                "transcribed_text": transcribed_text,
                "bert_results": results,
                "toxic_words": toxic_words,
            }
            severe_toxicity_score = results.get("severe_toxicity", 0)
        else:
            results = analyze_text_with_perspective(transcribed_text)
            response_data = {
                "transcribed_text": transcribed_text,
                "perspective_results": results,
                "toxic_words": toxic_words,
            }
            severe_toxicity_score = results.get("attributeScores", {}).get("SEVERE_TOXICITY", {}).get("summaryScore", {}).get("value", 0)
        print("severe toxicity score : ",severe_toxicity_score)
        if severe_toxicity_score is not None:
            status = "Toxic" if severe_toxicity_score > 0.15 else "Non-Toxic"

        ##########################################
        user_id = session.get("user_id")
        username = session.get("username")
        if user_id and username:
            user = User.objects(id=user_id).first()
            if user:
                analysis_log = AnalysisLog(
                    username=user,  # Store username in the log
                    audio_file_name=filename,
                    model_used=model,
                    transcribed_text=transcribed_text,
                    toxic_words=toxic_words,
                    results=str(results),
                    toxicity = status,
                    created_at = datetime.now().strftime("%b %d, %Y | %I:%M %p")
                )
                analysis_log.save()
                user.user_logs.append(analysis_log)
                user.save()
        ##########################################

        return jsonify(response_data)
    
    except Exception as e:
        return jsonify({"error": f"Analysis failed: {str(e)}"}), 500
    
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)


#CHAT APPLICATION BACKEND STARTS HERE

# app.config['UPLOAD_FOLDER'] = 'uploads/'
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

toxic_words = set()

# Load toxic words from CSV
with open("toxic_words.csv", "r") as csvfile:
    reader = csv.reader(csvfile)
    for row in reader:
        for word in row:
            toxic_words.add(word.lower().strip())
            
# Find toxic words in text
def find_toxic_words(text):
    text_words = set(text.lower().split())
    return [word for word in text_words if word in toxic_words]

# API to analyze audio
@app.route("/analyzeChat", methods=["POST"])
def analyze_audio_chat():
    if 'audioFile' not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files['audioFile']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    filename = secure_filename(file.filename)
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(file_path)

    try:
        transcribed_text = transcribe_audio(file_path)
        perspective_results = analyze_text_with_perspective(transcribed_text)
        toxicity_scores = [
            attr["summaryScore"]["value"]
            for attr in perspective_results["attributeScores"].values()
        ]
        total_score = sum(toxicity_scores)

        if total_score > 1:
            toxic_words_found = find_toxic_words(transcribed_text)
            return jsonify({"toxicWords": toxic_words_found})
        else:
            return jsonify({"result": False})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        os.remove(file_path)  # Clean up uploaded file

#CHAT APPLICATION BACKEND ENDS HERE

# Serve frontend files
@app.route("/")
def serve_signup():
    return send_from_directory("frontend", "login.html")

@app.route("/realTimeChecker")
def serve_chat():
    return send_from_directory("frontend","chat.html")

@app.route("/webSpeech")
def serve_web():
    return send_from_directory("frontend","webSpeech.html")

@app.route("/home")
def serve_home():
    return send_from_directory("frontend","index.html")

# Login route
@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        user = User.objects(username=username, password=password).first()
        if user:
            session["user_id"] = str(user.id)
            session["username"] = user.username
            print(session)
            return redirect('/home')
        else:
            return redirect("/login")
    else:
        return send_from_directory("frontend", "login.html")

# Logout route
@app.route("/logout", methods=["GET"])
def logout():
    session.pop("user_id", None)
    session.pop("username", None)
    print(session)
    return redirect("/login")

# Signup route
@app.route("/signup", methods=["POST","GET"])
def signup():
    if request.method=="GET":
        return send_from_directory("frontend", "signup.html")
    new_password = request.form.get("newPassword")
    confirm_password = request.form.get("confirmPassword")
    username = request.form.get("username")

    if new_password == confirm_password:
        new_user = User(username=username, password=new_password)
        try:
            new_user.save()
            return redirect("/login")
        except:
            return redirect("/")
    else:
        return redirect("/")
    
@app.route("/get_user_logs", methods=["GET"])
def get_user_logs():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "User not logged in"}), 400

    # Find the user by ID
    user = User.objects(id=user_id).first()
    if user:
        # Manually retrieve related AnalysisLog documents by referencing the user_logs field
        user_logs = []
        for log in user.user_logs:
            print(f"Log Type: {type(log)}")  # Debugging: Check the type of log
            if isinstance(log, str):
                log_id = ObjectId(log)  # If it's a string, convert it to ObjectId
            elif isinstance(log, AnalysisLog):
                log_id = log.id  # If it's an object, get the ObjectId from the AnalysisLog
            else:
                # Handle unexpected log types
                continue

            print(f"Log ID: {log_id}")  # Debugging: Check the value of log_id
            try:
                # Fetch AnalysisLog by ObjectId
                analysis_log = AnalysisLog.objects(id=log_id).first()
                if analysis_log:
                    log_data = {
                        "song_name": analysis_log.audio_file_name,
                        "toxicity": analysis_log.toxicity,
                        "created_at": analysis_log.created_at # Format the datetime
                    }
                    user_logs.append(log_data)
            except Exception as e:
                print(f"Error fetching AnalysisLog: {e}")

        return jsonify(user_logs)

    return jsonify({"error": "No Logs"}), 404


@app.route("/<path:path>")
def serve_static(path):
    return send_from_directory("frontend", path)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3000)
