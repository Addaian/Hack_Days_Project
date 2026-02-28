import httpx
from elevenlabs_client import _api_key

BASE_URL = "https://api.elevenlabs.io/v1"


def transcribe(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    if not audio_bytes:
        raise ValueError("Audio bytes are empty.")

    headers = {"xi-api-key": _api_key()}
    files = {
        "file": (filename, audio_bytes, "audio/webm"),
        "model_id": (None, "scribe_v1"),
    }

    response = httpx.post(
        f"{BASE_URL}/speech-to-text",
        headers=headers,
        files=files,
        timeout=120,
    )

    if response.status_code == 401:
        raise RuntimeError("Invalid ElevenLabs API key.")
    if response.status_code == 429:
        raise RuntimeError("ElevenLabs rate limit hit. Please wait a moment and try again.")

    response.raise_for_status()

    text = response.json().get("text", "")
    return text
