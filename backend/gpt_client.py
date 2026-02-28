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


def clean_transcript(
    raw: str,
    audiences: list[str] | None = None,
    styles: list[str] | None = None,
) -> str:
    client = _get_client()

    audiences = audiences or ["General"]
    styles = styles or []

    non_general = [a for a in audiences if a != "General"]
    audience_line = (
        f" Adjust phrasing to suit a {', '.join(non_general)} audience."
        if non_general
        else ""
    )

    style_map = {
        "More Confident": "confident and assertive",
        "Humorous": "lightly humorous and engaging",
    }
    style_parts = [style_map.get(s, s.lower()) for s in styles if s in style_map]
    style_line = f" Adjust tone to be {' and '.join(style_parts)}." if style_parts else ""

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
