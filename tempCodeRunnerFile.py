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
import pytz
from bson import ObjectId
from flask_cors import CORS
from datetime import datetime, timezone
from mongoengine import connect, Document, StringField, ListField, ReferenceField, EmbeddedDocument, EmbeddedDocumentField, DateTimeField

# Configuration
UPLOAD_FOLDER = tempfile.gettempdir()
PERSPECTIVE_API_KEY = "AIzaSyALoQ_KT6bH3Xhkwv0aboLF1dkDAuFdj5k"
API_URL = "https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze"
SECRET_KEY = "Daron@123"

# Flask app
app = Flask(__name__)
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
    created_at = DateTimeField(default=datetime.now)
    username = ReferenceField('User', required=True)

    def save(self, *args, **kwargs):
        ist_timezone = pytz.timezone('Asia/Kolkata')
        if not self.created_at:
            self.created_at = datetime.now(ist_timezone)
        else:
            self.created_at = self.created_at.astimezone(ist_timezone)  # Convert existing time to IST
        super(AnalysisLog, self).save(*args, **kwargs)