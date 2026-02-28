import io
import os
import openai

_client: openai.OpenAI | None = None


def _get_client() -> openai.OpenAI:
    global _client
    if _client is None:
        key = os.environ.get("OPENAI_API_KEY", "")
        if not key:
            raise RuntimeError("OPENAI_API_KEY is not set.")
        _client = openai.OpenAI(api_key=key, timeout=120)
    return _client


def transcribe(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    if not audio_bytes:
        raise ValueError("Audio bytes are empty.")

    client = _get_client()
    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = filename

    result = client.audio.transcriptions.create(
        model="whisper-1",
        file=audio_file,
    )
    return result.text
