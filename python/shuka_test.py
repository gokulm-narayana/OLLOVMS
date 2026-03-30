import torch
from transformers import AutoModel, AutoProcessor
import librosa
import os
import sys

# Constants
MODEL_NAME = "sarvamai/shuka-1"
DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"

print(f"Loading Shuka v1 on device: {DEVICE}")
print("This will download ~15GB of weights if not cached. Please wait...")

try:
    # Load processor and model
    processor = AutoProcessor.from_pretrained(MODEL_NAME, trust_remote_code=True)
    model = AutoModel.from_pretrained(MODEL_NAME, trust_remote_code=True, torch_dtype=torch.float16)
    
    # Move model to Apple Silicon GPU
    model = model.to(DEVICE)
    print("Model loaded successfully!")

    # Prompt
    prompt = """You are a SQL expert for a VMS. Listen to the user's voice command and output ONLY a SQLite query for the 'alerts' table.
    Schema: alerts(id, type, severity, location, camera_name, description, timestamp)
    <|audio|>"""

    # We need a dummy audio file or real audio file to test
    # If the user doesn't have an audio file ready, we can just print success that the model loaded.
    print("Model initialized. Ready for audio inference.")
    print("Memory check passed. The M4 Mac can physically load the model.")

except Exception as e:
    print(f"Failed to load model: {e}")
    sys.exit(1)
