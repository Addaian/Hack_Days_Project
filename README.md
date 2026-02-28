# Alto

Record yourself speaking and hear a cleaned-up version played back in your own cloned voice — filler words removed, phrasing tightened.

**The demo moment:** A volunteer speaks for 60 seconds. Within 30 seconds they hear themselves back, clean and confident.

---

## How It Works

1. **Voice Sample** — Record a 30-second reading to clone your voice
2. **Main Recording** — Record your actual speech (up to 5 minutes)
3. **Configure** — Pick target audience and style (optional)
4. **Process** — ElevenLabs Scribe transcribes → GPT-4o cleans → ElevenLabs speaks in your voice
5. **Results** — Side-by-side original vs. cleaned audio, transcript diff, filler stats

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 16 + Tailwind CSS |
| Backend | Python FastAPI |
| Transcription | ElevenLabs Scribe (`scribe_v1`) |
| LLM Cleaning | GPT-4o |
| Voice Clone + TTS | ElevenLabs Instant Voice Clone |

---

## Setup

### Prerequisites
- Node.js 18+
- Python 3.12+
- OpenAI API key
- ElevenLabs API key

### Backend

```bash
cd backend
cp .env.example .env
# Fill in OPENAI_API_KEY and ELEVENLABS_API_KEY in .env

python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
├── backend/
│   ├── main.py               # FastAPI app — /health, /clone, /analyze
│   ├── stt_client.py         # ElevenLabs Scribe transcription
│   ├── gpt_client.py         # GPT-4o filler removal
│   ├── elevenlabs_client.py  # Voice clone + TTS
│   └── requirements.txt
└── frontend/
    ├── app/
    │   ├── page.tsx           # 3-step recording + config flow
    │   └── results/page.tsx   # Stats, dual audio players, transcript diff
    └── components/
        ├── Recorder.tsx        # MediaRecorder with MIME detection
        ├── AudioPlayer.tsx     # Labeled audio player with download
        └── TranscriptDiff.tsx  # Filler word highlighting
```

---

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/clone` | Upload voice sample, returns `voice_id` |
| POST | `/analyze` | Transcribe + clean + synthesize speech |

### POST /analyze

**Form fields:** `audio`, `voice_id`, `audience` (General/Investors/Technical), `style` (Neutral/More Confident/Add Humor), `duration`

**Response:**
```json
{
  "raw_transcript": "...",
  "cleaned_transcript": "...",
  "fillers": [{ "word": "um", "count": 12 }],
  "total_fillers": 20,
  "original_wpm": 145,
  "cleaned_wpm": 132,
  "audio_url": "/audio/abc123.mp3"
}
```
