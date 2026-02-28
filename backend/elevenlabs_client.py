import os
import uuid
import httpx


def _api_key() -> str:
    key = os.environ.get("ELEVENLABS_API_KEY", "")
    if not key:
        raise RuntimeError("ELEVENLABS_API_KEY is not set.")
    return key


BASE_URL = "https://api.elevenlabs.io/v1"


def create_clone(audio_bytes: bytes, name: str | None = None) -> str:
    """Upload a voice sample to ElevenLabs and return the new voice_id."""
    voice_name = name or f"voiceup-{uuid.uuid4().hex[:8]}"
    headers = {"xi-api-key": _api_key()}

    files = {
        "files": ("sample.webm", audio_bytes, "audio/webm"),
        "name": (None, voice_name),
    }

    response = httpx.post(
        f"{BASE_URL}/voices/add",
        headers=headers,
        files=files,
        timeout=90,
    )

    if response.status_code == 429:
        raise RuntimeError("ElevenLabs rate limit hit. Please wait a moment and try again.")
    if response.status_code == 401:
        raise RuntimeError("Invalid ElevenLabs API key.")

    response.raise_for_status()

    data = response.json()
    voice_id = data.get("voice_id")
    if not voice_id:
        raise RuntimeError(f"ElevenLabs did not return a voice_id. Response: {data}")
    return voice_id


def text_to_speech(text: str, voice_id: str) -> bytes:
    """Convert text to speech using a cloned voice, return audio bytes (MP3)."""
    if not text.strip():
        raise ValueError("Cannot generate TTS for empty text.")

    headers = {
        "xi-api-key": _api_key(),
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    payload = {
        "text": text,
        "model_id": "eleven_turbo_v2",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
        },
    }

    response = httpx.post(
        f"{BASE_URL}/text-to-speech/{voice_id}",
        headers=headers,
        json=payload,
        timeout=120,
    )

    if response.status_code == 404:
        raise RuntimeError(f"Voice ID '{voice_id}' not found. It may have been deleted.")
    if response.status_code == 429:
        raise RuntimeError("ElevenLabs rate limit hit. Please wait a moment and try again.")
    if response.status_code == 401:
        raise RuntimeError("Invalid ElevenLabs API key.")

    response.raise_for_status()

    audio = response.content
    if len(audio) < 100:
        raise RuntimeError("ElevenLabs returned empty audio. Please try again.")
    return audio
