"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Recorder from "@/components/Recorder";
import { setResult, setRedoBlobs, getRedoBlobs } from "@/lib/store";

const READING_PROMPT =
  "The quick brown fox jumps over the lazy dog. Technology shapes how we communicate, collaborate, and create. Every day presents new opportunities to learn, grow, and make a meaningful impact on the world around us.";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 120_000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

const AUDIENCES = ["General", "Professional", "Technical"] as const;
const STYLES = ["More Confident", "Humorous"] as const;

export default function Home() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [voiceSampleBlob, setVoiceSampleBlob] = useState<Blob | null>(null);
  const [speechBlob, setSpeechBlob] = useState<Blob | null>(null);
  const [speechDuration, setSpeechDuration] = useState(0);
  const [audiences, setAudiences] = useState<string[]>(["General"]);
  const [styles, setStyles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Redo mode: if blobs are already stored, jump to step 3
  useEffect(() => {
    const { voiceSampleBlob: vsb, speechBlob: sb } = getRedoBlobs();
    if (vsb && sb) {
      setVoiceSampleBlob(vsb);
      setSpeechBlob(sb);
      setStep(3);
    }
  }, []);

  const toggleAudience = (value: string) => {
    setAudiences((prev) => {
      if (prev.includes(value)) {
        return prev.length === 1 ? prev : prev.filter((a) => a !== value);
      }
      return [...prev, value];
    });
  };

  const toggleStyle = (value: string) => {
    setStyles((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]
    );
  };

  const handleProcess = async () => {
    if (!voiceSampleBlob || !speechBlob) return;
    setLoading(true);
    setError(null);

    try {
      setRedoBlobs(voiceSampleBlob, speechBlob);

      setLoadingMsg("Cloning your voice…");
      const cloneForm = new FormData();
      cloneForm.append("voice_sample", voiceSampleBlob, "voice_sample.webm");
      let cloneRes: Response;
      try {
        cloneRes = await fetchWithTimeout(`${API}/clone`, { method: "POST", body: cloneForm }, 90_000);
      } catch {
        throw new Error("Voice cloning timed out. Check your internet connection.");
      }
      if (!cloneRes.ok) {
        const err = await cloneRes.json().catch(() => ({}));
        throw new Error(err.detail || `Voice cloning failed (${cloneRes.status})`);
      }
      const { voice_id } = await cloneRes.json();

      setLoadingMsg("Transcribing your speech…");
      const analyzeForm = new FormData();
      analyzeForm.append("audio", speechBlob, "speech.webm");
      analyzeForm.append("voice_id", voice_id);
      analyzeForm.append("audiences", audiences.join(","));
      analyzeForm.append("styles", styles.join(","));
      analyzeForm.append("duration", String(speechDuration));

      let analyzeRes: Response;
      try {
        analyzeRes = await fetchWithTimeout(`${API}/analyze`, { method: "POST", body: analyzeForm }, 180_000);
      } catch {
        throw new Error("Analysis timed out. Try a shorter clip.");
      }

      setLoadingMsg("Generating your cleaned audio…");
      if (!analyzeRes.ok) {
        const err = await analyzeRes.json().catch(() => ({}));
        throw new Error(err.detail || `Analysis failed (${analyzeRes.status})`);
      }
      const result = await analyzeRes.json();
      const originalUrl = URL.createObjectURL(speechBlob);
      setResult({ ...result, original_audio_url: originalUrl, api_base: API, voice_id, speech_duration: speechDuration }, speechBlob);
      router.push("/results");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  };

  return (
    <>
      {/* Hero */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white py-14 px-4">
        <div className="max-w-xl mx-auto text-center">
          <span className="inline-flex items-center gap-1.5 bg-indigo-500/20 border border-indigo-400/30 rounded-full px-4 py-1 text-indigo-300 text-xs font-semibold uppercase tracking-widest mb-5">
            AI Speech Coach
          </span>
          <h1 className="text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white to-indigo-200 bg-clip-text text-transparent">
            VoiceUp
          </h1>
          <p className="text-slate-400 mt-3 text-lg">Speak. Clean. Sound confident.</p>
        </div>
      </div>

      <main className="max-w-xl mx-auto px-4 py-10 flex flex-col gap-6">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                s === step ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200"
                : s < step ? "bg-green-500 text-white"
                : "bg-gray-100 text-gray-400"
              }`}>
                {s < step ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : s}
              </div>
              {s < 3 && <div className={`w-12 h-0.5 rounded ${s < step ? "bg-green-400" : "bg-gray-200"}`} />}
            </div>
          ))}
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col gap-6">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm shrink-0">1</div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Voice Sample</h2>
                <p className="text-gray-500 text-sm mt-0.5">Read the passage below — this trains VoiceUp to sound like you.</p>
              </div>
            </div>
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-gray-700 text-sm leading-relaxed italic">
              &ldquo;{READING_PROMPT}&rdquo;
            </div>
            <Recorder label="~30 sec reading" maxSeconds={60} minSeconds={5} onComplete={(blob) => setVoiceSampleBlob(blob)} />
            {voiceSampleBlob && (
              <button onClick={() => setStep(2)} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-colors">
                Next: Record Your Speech →
              </button>
            )}
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col gap-6">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm shrink-0">2</div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Record Your Speech</h2>
                <p className="text-gray-500 text-sm mt-0.5">Give your pitch, presentation, or talk — up to 5 minutes.</p>
              </div>
            </div>
            <Recorder
              label="Your speech (up to 5 min)"
              maxSeconds={300}
              minSeconds={3}
              allowUpload
              onComplete={(blob, duration) => { setSpeechBlob(blob); setSpeechDuration(duration); }}
            />
            {speechBlob && (
              <button onClick={() => setStep(3)} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-colors">
                Next: Configure →
              </button>
            )}
            <button onClick={() => setStep(1)} className="text-sm text-gray-400 hover:text-gray-600 underline text-center">← Back</button>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col gap-6">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm shrink-0">3</div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Configure</h2>
                <p className="text-gray-500 text-sm mt-0.5">Select all that apply — or leave defaults for a clean, neutral result.</p>
              </div>
            </div>

            <div className="flex flex-col gap-5">
              {/* Audience */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Target Audience</p>
                <div className="flex flex-wrap gap-2">
                  {AUDIENCES.map((a) => (
                    <button
                      key={a}
                      onClick={() => toggleAudience(a)}
                      className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                        audiences.includes(a)
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                          : "bg-white border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600"
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>

              {/* Style */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Tone <span className="font-normal text-gray-400">(optional)</span></p>
                <div className="flex flex-wrap gap-2">
                  {STYLES.map((s) => (
                    <button
                      key={s}
                      onClick={() => toggleStyle(s)}
                      className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                        styles.includes(s)
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                          : "bg-white border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              onClick={handleProcess}
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-base"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  {loadingMsg}
                </>
              ) : "Process My Speech ✨"}
            </button>

            <button onClick={() => setStep(2)} className="text-sm text-gray-400 hover:text-gray-600 underline text-center">← Back</button>
          </div>
        )}
      </main>
    </>
  );
}
