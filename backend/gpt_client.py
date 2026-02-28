import os
import openai

_client: openai.OpenAI | None = None


def _get_client() -> openai.OpenAI:
    global _client
    if _client is None:
        key = os.environ.get("OPENAI_API_KEY", "")
        if not key:
            raise RuntimeError("OPENAI_API_KEY is not set.")
        _client = openai.OpenAI(api_key=key, timeout=60)
    return _client


def clean_transcript(raw: str, audience: str = "General", style: str = "Neutral") -> str:
    client = _get_client()

    audience_line = f" Also adjust phrasing to suit a {audience} audience." if audience != "General" else ""
    style_line = f" Adjust tone to be {style}." if style != "Neutral" else ""

    system_prompt = (
        "You are a speech coach. Given a spoken transcript, remove all filler words "
        "(um, uh, like, you know, sort of, basically, literally, right, okay so) and false starts. "
        "Preserve the speaker's meaning, vocabulary, and sentence structure as much as possible. "
        "Do not add new ideas or change the message."
        f"{audience_line}{style_line}"
        " Return only the cleaned transcript. No commentary."
    )

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": raw},
        ],
        max_tokens=4096,
    )

    choices = response.choices
    if not choices or not choices[0].message.content:
        raise RuntimeError("GPT-4o returned an empty response. Please try again.")

    return choices[0].message.content.strip()
