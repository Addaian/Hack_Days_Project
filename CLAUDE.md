# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend
```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload --port 8000   # dev server
```

### Frontend
```bash
cd frontend
npm run dev          # dev server on :3000
npm run build        # production build
npx tsc --noEmit     # type check
```

---

## Architecture

Monorepo with two independent services:

- **`frontend/`** — Next.js 16 App Router, deployed separately from the backend
- **`backend/`** — FastAPI, runs on port 8000

### Request flow

```
browser → POST /clone  → ElevenLabs (voice clone) → voice_id
browser → POST /analyze → ElevenLabs Scribe STT → GPT-4o → ElevenLabs TTS → .mp3 saved to /tmp/voiceup_audio/
```

### Frontend state management

There is no global state library. Results are kept in `frontend/lib/store.ts` — a plain module-level variable that survives Next.js client-side navigation. `setResult()` is called on the home page after `/analyze` responds; `getResult()` is read on the results page; `clearResult()` revokes the blob URL and resets on "Start Over".

The original recording blob URL (`URL.createObjectURL`) is stored in this module store — **not** in `sessionStorage` — because blob URLs die on page unload.

### Multi-step recording flow (`app/page.tsx`)

Steps 1 → 2 → 3 are local React state. Step 1 captures the voice sample (used only for `/clone`), Step 2 captures the main speech + its duration in seconds (passed to `/analyze` for WPM calculation), Step 3 is the config form + submit.

### Backend clients

Each external API has its own module with a singleton client:

| File | Singleton | Key function |
|------|-----------|--------------|
| `stt_client.py` | none (httpx per-call, reuses `_api_key()` from elevenlabs_client) | `transcribe(audio_bytes, filename)` |
| `gpt_client.py` | `_client` (OpenAI, 60s timeout) | `clean_transcript(raw, audience, style)` |
| `elevenlabs_client.py` | none (httpx per-call) | `create_clone(audio_bytes)`, `text_to_speech(text, voice_id)` |

### Audio file lifecycle

ElevenLabs TTS output is written to `/tmp/voiceup_audio/{uuid}.mp3` and served via FastAPI `StaticFiles` mounted at `/audio`. Files older than 1 hour are deleted on every `/analyze` request inside `_cleanup_old_audio()`.

### CORS

Hardcoded to allow `localhost:3000` and `*.vercel.app`. Additional origins can be added at runtime via the `ALLOWED_ORIGINS` env var (comma-separated).

### Environment variables

| Var | Where | Purpose |
|-----|-------|---------|
| `OPENAI_API_KEY` | `backend/.env` | GPT-4o cleaning |
| `ELEVENLABS_API_KEY` | `backend/.env` | Scribe STT + voice clone + TTS |
| `NEXT_PUBLIC_API_URL` | `frontend/.env.local` | Backend base URL (default: `http://localhost:8000`) |
| `ALLOWED_ORIGINS` | backend env | Extra CORS origins |
