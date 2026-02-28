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
from mutagen.mp3 import MP3

import stt_client
import gpt_client
import elevenlabs_client

app = FastAPI(title="VoiceUp API")

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

AUDIO_DIR = Path(tempfile.gettempdir()) / "voiceup_audio"
AUDIO_DIR.mkdir(exist_ok=True)

app.mount("/audio", StaticFiles(directory=str(AUDIO_DIR)), name="audio")

FILLERS = [
    "you know", "sort of", "okay so",
    "basically", "literally",
    "um", "uh", "like", "right",
]
_FILLER_PATTERNS = [
    (filler, re.compile(r"\b" + re.escape(filler) + r"\b", re.IGNORECASE))
    for filler in FILLERS
]

_VALID_AUDIENCE = {"General", "Professional", "Technical"}
_VALID_STYLE = {"More Confident", "Humorous", "Sad"}

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


def calculate_tts_speed(original_word_count: int, cleaned_word_count: int, original_duration: float) -> float:
    """Calculate optimal TTS speed to maintain similar WPM to original speech.

    The goal is to make the cleaned speech take proportionally less time,
    but not go too fast. We slow down the TTS to keep WPM similar.
    """
    if original_word_count == 0 or cleaned_word_count == 0 or original_duration <= 0:
        return 0.85  # Default speed

    # Calculate what the target duration should be if we maintain original WPM
    original_wpm = original_word_count / (original_duration / 60)
    target_duration = (cleaned_word_count / original_wpm) * 60  # in seconds

    # ElevenLabs at speed=1.0 speaks at roughly 150-180 WPM
    # At speed=0.85, it's roughly 130-150 WPM
    # We want to calculate speed such that the TTS duration matches target_duration

    # Estimate: at speed=1.0, TTS would take (cleaned_word_count / 160) * 60 seconds
    estimated_duration_at_full_speed = (cleaned_word_count / 160) * 60

    # Calculate required speed multiplier
    if estimated_duration_at_full_speed > 0:
        speed = estimated_duration_at_full_speed / target_duration
    else:
        speed = 0.85

    # Clamp to reasonable range (0.6 to 1.0)
    # Don't go below 0.6 as it sounds too slow
    speed = max(0.6, min(1.0, speed))

    return speed


def _save_audio(audio_bytes: bytes) -> str:
    filename = f"{uuid.uuid4().hex}.mp3"
    (AUDIO_DIR / filename).write_bytes(audio_bytes)
    return f"/audio/{filename}"


def _get_audio_duration(audio_url: str) -> float:
    """Get duration in seconds from an audio URL like /audio/filename.mp3"""
    try:
        # Extract filename from URL
        filename = audio_url.split("/")[-1]
        file_path = AUDIO_DIR / filename

        if not file_path.exists():
            return 0.0

        audio = MP3(str(file_path))
        return audio.info.length
    except Exception:
        return 0.0


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
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"Voice cloning failed: {str(e)}")
    return {"voice_id": voice_id}


@app.post("/analyze")
async def analyze(
    audio: UploadFile = File(...),
    voice_id: str = Form(...),
    audiences: str = Form(default="General"),
    styles: str = Form(default=""),
    duration: float = Form(default=0),
):
    if not voice_id.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="voice_id is required.")

    audience_list = [a.strip() for a in audiences.split(",") if a.strip()]
    style_list = [s.strip() for s in styles.split(",") if s.strip()]
    audience_list = [a for a in audience_list if a in _VALID_AUDIENCE] or ["General"]
    style_list = [s for s in style_list if s in _VALID_STYLE]

    audio_bytes = await audio.read()
    if len(audio_bytes) < 1000:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Audio is too short or empty. Please record a longer clip.")

    _cleanup_old_audio()

    try:
        raw_transcript = stt_client.transcribe(audio_bytes, filename=audio.filename or "audio.webm")
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"Transcription failed: {str(e)}")

    if not raw_transcript.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="No speech detected in the recording. Please try again.")

    fillers, total_fillers = count_fillers(raw_transcript)
    original_wpm = calculate_wpm(raw_transcript, duration)

    try:
        cleaned_transcript = gpt_client.clean_transcript(
            raw_transcript, audiences=audience_list, styles=style_list
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"Cleaning failed: {str(e)}")

    # Calculate optimal TTS speed to maintain similar WPM
    original_word_count = len(raw_transcript.split())
    cleaned_word_count = len(cleaned_transcript.split())
    tts_speed = calculate_tts_speed(original_word_count, cleaned_word_count, duration)

    try:
        tts_audio = elevenlabs_client.text_to_speech(cleaned_transcript, voice_id, speed=tts_speed)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"TTS generation failed: {str(e)}")

    # Save audio and get its duration for accurate cleaned_wpm
    audio_url = _save_audio(tts_audio)
    tts_duration = _get_audio_duration(audio_url)

    # Use TTS audio duration for cleaned WPM if available, otherwise fall back to original
    cleaned_wpm = calculate_wpm(cleaned_transcript, tts_duration if tts_duration > 0 else duration)

    return {
        "raw_transcript": raw_transcript,
        "cleaned_transcript": cleaned_transcript,
        "fillers": fillers,
        "total_fillers": total_fillers,
        "original_wpm": original_wpm,
        "cleaned_wpm": cleaned_wpm,
        "audio_url": audio_url,
    }


@app.post("/tts")
async def tts(
    text: str = Form(...),
    voice_id: str = Form(...),
):
    if not voice_id.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="voice_id is required.")
    if not text.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="text is required.")

    _cleanup_old_audio()

    try:
        tts_audio = elevenlabs_client.text_to_speech(text.strip(), voice_id)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"TTS generation failed: {str(e)}")

    return {"audio_url": _save_audio(tts_audio)}
