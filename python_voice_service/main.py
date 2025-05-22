from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware # Added for CORS
import whisper
import torch
import asyncio
import tempfile
import os
import numpy as np
import io
from scipy.io.wavfile import write as write_wav
import nltk
from transformers import AutoProcessor, BarkModel

app = FastAPI()

# CORS Configuration
# Define allowed origins (adjust as needed for production)
# For development, allowing localhost for typical frontend dev ports.
# Astro default dev port is 4321. React default is 3000.
origins = [
    "http://localhost",       # General localhost
    "http://localhost:4321",  # Astro dev server
    "http://localhost:3000",  # Common React dev server
    # Add your deployed frontend URL here in production
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  # List of origins that are allowed to make cross-origin requests.
    allow_credentials=True, # Allow cookies to be included in cross-origin requests.
    allow_methods=["*"],    # Allows all methods (GET, POST, PUT, etc.). Or specify like ["GET", "POST"].
    allow_headers=["*"],    # Allows all headers. Or specify like ["Content-Type"].
)


stt_model = None
tts_service_instance = None # Placeholder for TTS service
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Attempting to use device: {device}") # Log device selection attempt

# Bark TTS Service Class
class TextToSpeechService:
    def __init__(self, device_type: str = "cpu"):
        self.device = device_type
        print(f"Initializing TextToSpeechService on device: {self.device}")
        self.processor = AutoProcessor.from_pretrained("suno/bark-small")
        self.model = BarkModel.from_pretrained("suno/bark-small")
        
        if self.device == "cuda":
            print("Moving Bark model to CUDA device.")
            self.model.to(self.device)
        # For CPU, Bark generally handles device placement well without explicit .to(device)

    def synthesize(self, text: str, voice_preset: str = "v2/en_speaker_1"): # Changed to English preset
        print(f"Synthesizing short text with voice preset: {voice_preset}")
        inputs = self.processor(text, voice_preset=voice_preset, return_tensors="pt")
        
        if self.device == "cuda":
             inputs = {k: v.to(self.device) for k, v in inputs.items()}

        # Using processor's pad_token_id
        pad_token_id = self.processor.tokenizer.pad_token_id
        print(f"Using pad_token_id: {pad_token_id} for generation.")
        
        with torch.no_grad():
            audio_array = self.model.generate(**inputs, pad_token_id=pad_token_id) 
        
        audio_array = audio_array.cpu().numpy().squeeze()
        sample_rate = self.model.generation_config.sample_rate
        print(f"Short text synthesized. Sample rate: {sample_rate}, Array shape: {audio_array.shape}")
        return sample_rate, audio_array

    def long_form_synthesize(self, text: str, voice_preset: str = "v2/en_speaker_1"): # Changed to English preset
        print("Starting long-form synthesis...")
        pieces = []
        sentences = nltk.sent_tokenize(text)
        print(f"Text tokenized into {len(sentences)} sentences.")
        
        silence_duration_seconds = 0.25 
        sample_rate_for_silence = self.model.generation_config.sample_rate
        silence = np.zeros(int(silence_duration_seconds * sample_rate_for_silence), dtype=np.float32)

        for i, sent in enumerate(sentences):
            print(f"Synthesizing sentence {i+1}/{len(sentences)}: {sent[:30]}...")
            # Pass the potentially overridden voice_preset from the endpoint
            sample_rate, audio_array = self.synthesize(sent, voice_preset=voice_preset) 
            pieces.append(audio_array)
            pieces.append(silence.copy())
        
        if not pieces:
            print("No audio pieces generated (e.g., input text was empty or only punctuation).")
            return self.model.generation_config.sample_rate, np.array([], dtype=np.float32)
            
        if pieces:
            pieces.pop()

        final_audio_array = np.concatenate(pieces) if pieces else np.array([], dtype=np.float32)
        print(f"Long-form synthesis complete. Final array shape: {final_audio_array.shape}")
        return self.model.generation_config.sample_rate, final_audio_array


@app.on_event("startup")
async def startup_event():
    global stt_model, tts_service_instance, device
    
    # Load Whisper STT model (English-specific)
    print(f"Loading Whisper STT model (English specific: base.en) on device: {device}")
    try:
        stt_model = whisper.load_model("base.en", device=device) # Changed to "base.en"
        print("Whisper STT model (English specific) loaded successfully.")
    except Exception as e:
        print(f"Error loading Whisper model (base.en): {e}")
        stt_model = None

    # Download NLTK punkt tokenizer for Bark
    print("Downloading NLTK punkt tokenizer (if not already present)...")
    try:
        nltk.download('punkt', quiet=True)
        print("NLTK punkt tokenizer is available.")
    except Exception as e:
        print(f"Error downloading NLTK punkt: {e}. TTS might fail for long texts.")

    # Load Bark TTS model and service
    print(f"Loading Bark TTS model and service on device: {device}")
    try:
        tts_service_instance = TextToSpeechService(device_type=device)
        print("Bark TTS model and service loaded successfully.")
    except Exception as e:
        print(f"Fatal error loading Bark TTS model: {e}")
        tts_service_instance = None


@app.post("/stt/")
async def transcribe_audio(audio: UploadFile = File(...)):
    if not stt_model:
        print("STT model not loaded or failed to load. Cannot process STT request.")
        raise HTTPException(status_code=503, detail="STT model is not available.")

    tmp_audio_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(audio.filename)[1] if audio.filename else ".wav") as tmp_audio_file:
            content = await audio.read()
            tmp_audio_file.write(content)
            tmp_audio_path = tmp_audio_file.name
        
        print(f"Temporary audio file for STT created at: {tmp_audio_path}")
        use_fp16 = torch.cuda.is_available()
        print(f"Transcribing STT with fp16={use_fp16}")
        
        # With "base.en" model, language parameter is not needed for transcribe.
        # If it were a multilingual model, we would add: language="en"
        result = await asyncio.to_thread(stt_model.transcribe, tmp_audio_path, fp16=use_fp16)
        transcribed_text = result["text"]
        
        print(f"STT Transcription successful. Text: {transcribed_text[:100]}...")
        return {"text": transcribed_text}
    
    except Exception as e:
        error_message = f"Error during STT transcription: {str(e)}"
        print(error_message)
        raise HTTPException(status_code=500, detail=error_message)
    
    finally:
        if tmp_audio_path and os.path.exists(tmp_audio_path):
            try:
                os.remove(tmp_audio_path)
                print(f"Temporary STT audio file {tmp_audio_path} removed.")
            except Exception as e_remove:
                print(f"Error removing temporary STT file {tmp_audio_path}: {e_remove}")

# Pydantic model for TTS request
class TTSRequest(BaseModel):
    text: str
    voice_preset: str = "v2/en_speaker_1" # Changed to English preset

@app.post("/tts/")
async def text_to_speech(request_data: TTSRequest):
    if not tts_service_instance:
        print("TTS service not available. Cannot process TTS request.")
        raise HTTPException(status_code=503, detail="TTS service is not available.")
    if not request_data.text.strip():
        print("TTS request text is empty.")
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    print(f"Received TTS request for text: \"{request_data.text[:50]}...\" with voice preset: {request_data.voice_preset}")
    try:
        sample_rate, audio_array = await asyncio.to_thread(
            tts_service_instance.long_form_synthesize, 
            request_data.text, 
            request_data.voice_preset # This will use the preset from the request, or the new English default if not provided
        )
        
        if audio_array.size == 0:
            print("TTS synthesis resulted in an empty audio array.")
            return StreamingResponse(io.BytesIO(), media_type="audio/wav")

        print(f"TTS synthesis successful. Sample rate: {sample_rate}, Audio array shape: {audio_array.shape}")

        wav_io = io.BytesIO()
        write_wav(wav_io, sample_rate, audio_array.astype(np.float32)) 
        wav_io.seek(0)
        
        print("Returning TTS audio as WAV stream.")
        return StreamingResponse(wav_io, media_type="audio/wav")
    except Exception as e:
        error_message = f"Error during TTS synthesis: {str(e)}"
        print(error_message) 
        raise HTTPException(status_code=500, detail=error_message)

if __name__ == "__main__":
    import uvicorn
    print("Starting FastAPI app with Uvicorn for debugging...")
    uvicorn.run(app, host="0.0.0.0", port=8008)
