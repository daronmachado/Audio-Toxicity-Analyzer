import whisper
import sys

def transcribe_audio(file_path):
    try:
        model = whisper.load_model("base")
        result = model.transcribe(file_path)
        return result["text"]
    except Exception as e:
        return f"Error: {str(e)}"

if __name__ == "__main__":
    # Get the file path from the command line argument
    file_path = sys.argv[1]
    transcription = transcribe_audio(file_path)
    print(transcription)
