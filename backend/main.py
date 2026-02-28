import os
import re
import uuid
import tempfile
import time
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import stt_client
import gpt_client
import elevenlabs_client

app = FastAPI(title="VoiceUp API")

# ALLOWED_ORIGINS env var: comma-separated list of extra origins (e.g. your Vercel URL)
_extra_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
_origins = ["http://localhost:3000"] + _extra_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Temp dir for generated audio files
AUDIO_DIR = Path(tempfile.gettempdir()) / "voiceup_audio"
AUDIO_DIR.mkdir(exist_ok=True)

app.mount("/audio", StaticFiles(directory=str(AUDIO_DIR)), name="audio")

# Pre-compile filler patterns once at startup (longest first to catch multi-word before single)
FILLERS = [
    "you know", "sort of", "okay so",  # multi-word first
    "basically", "literally",
    "um", "uh", "like", "right",
]
_FILLER_PATTERNS = [
    (filler, re.compile(r"\b" + re.escape(filler) + r"\b", re.IGNORECASE))
    for filler in FILLERS
]

# Allowed values for audience and style
_VALID_AUDIENCE = {"General", "Investors", "Technical"}
_VALID_STYLE = {"Neutral", "More Confident", "Add Humor"}

# Audio files older than 1 hour are cleaned up on each request
_AUDIO_TTL_SECONDS = 3600


def _cleanup_old_audio():
    now = time.time()
    for f in AUDIO_DIR.glob("*.mp3"):
        try:
            if now - f.stat().st_mtime > _AUDIO_TTL_SECONDS:
                f.unlink(missing_ok=True)
        except OSError:
            pass


def count_fillers(text: str) -> tuple[list[dict], int]:
    results = []
    total = 0
    for filler, pattern in _FILLER_PATTERNS:
        matches = pattern.findall(text)
        count = len(matches)
        if count > 0:
            results.append({"word": filler, "count": count})
            total += count
    return results, total


def calculate_wpm(text: str, duration_seconds: float) -> int:
    if duration_seconds <= 0:
        return 0
    words = len(text.split())
    return round(words / (duration_seconds / 60))


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/clone")
async def clone(voice_sample: UploadFile = File(...)):
    audio_bytes = await voice_sample.read()

    if len(audio_bytes) < 1000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Voice sample is too short or empty. Please record at least 5 seconds.",
        )

    try:
        voice_id = elevenlabs_client.create_clone(audio_bytes)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Voice cloning failed: {str(e)}",
        )
    return {"voice_id": voice_id}


@app.post("/analyze")
async def analyze(
    audio: UploadFile = File(...),
    voice_id: str = Form(...),
    audience: str = Form(default="General"),
    style: str = Form(default="Neutral"),
    duration: float = Form(default=0),
):
    # Validate inputs
    if not voice_id.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="voice_id is required.",
        )
    if audience not in _VALID_AUDIENCE:
        audience = "General"
    if style not in _VALID_STYLE:
        style = "Neutral"

    audio_bytes = await audio.read()
    if len(audio_bytes) < 1000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audio is too short or empty. Please record a longer clip.",
        )

    _cleanup_old_audio()

    # Step 1: Transcribe
    try:
        raw_transcript = stt_client.transcribe(
            audio_bytes, filename=audio.filename or "audio.webm"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Transcription failed: {str(e)}",
        )

    if not raw_transcript.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No speech detected in the recording. Please try again.",
        )

    # Step 2: Count fillers + WPM
    fillers, total_fillers = count_fillers(raw_transcript)
    original_wpm = calculate_wpm(raw_transcript, duration)

    # Step 3: Clean transcript
    try:
        cleaned_transcript = gpt_client.clean_transcript(raw_transcript, audience, style)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Cleaning failed: {str(e)}",
        )

    cleaned_wpm = calculate_wpm(cleaned_transcript, duration)

    # Step 4: TTS with cloned voice
    try:
        tts_audio = elevenlabs_client.text_to_speech(cleaned_transcript, voice_id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"TTS generation failed: {str(e)}",
        )

    # Save audio to temp file
    filename = f"{uuid.uuid4().hex}.mp3"
    audio_path = AUDIO_DIR / filename
    audio_path.write_bytes(tts_audio)

    return {
        "raw_transcript": raw_transcript,
        "cleaned_transcript": cleaned_transcript,
        "fillers": fillers,
        "total_fillers": total_fillers,
        "original_wpm": original_wpm,
        "cleaned_wpm": cleaned_wpm,
        "audio_url": f"/audio/{filename}",
    }
