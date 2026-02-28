"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Recorder from "@/components/Recorder";
import { setResult } from "@/lib/store";

const READING_PROMPT =
  "The quick brown fox jumps over the lazy dog. Technology shapes how we communicate, collaborate, and create. Every day presents new opportunities to learn, grow, and make a meaningful impact on the world around us.";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 120_000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

export default function Home() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [voiceSampleBlob, setVoiceSampleBlob] = useState<Blob | null>(null);
  const [speechBlob, setSpeechBlob] = useState<Blob | null>(null);
  const [speechDuration, setSpeechDuration] = useState(0);
  const [audience, setAudience] = useState("General");
  const [style, setStyle] = useState("Neutral");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleProcess = async () => {
    if (!voiceSampleBlob || !speechBlob) return;
    setLoading(true);
    setError(null);

    try {
      // Step 1: Clone voice
      setLoadingMsg("Cloning your voice…");
      const cloneForm = new FormData();
      cloneForm.append("voice_sample", voiceSampleBlob, "voice_sample.webm");

      let cloneRes: Response;
      try {
        cloneRes = await fetchWithTimeout(`${API}/clone`, { method: "POST", body: cloneForm }, 90_000);
      } catch {
        throw new Error("Voice cloning timed out. Check your internet connection and try again.");
      }
      if (!cloneRes.ok) {
        const err = await cloneRes.json().catch(() => ({}));
        throw new Error(err.detail || `Voice cloning failed (${cloneRes.status})`);
      }
      const { voice_id } = await cloneRes.json();

      // Step 2: Analyze speech
      setLoadingMsg("Transcribing your speech…");
      const analyzeForm = new FormData();
      analyzeForm.append("audio", speechBlob, "speech.webm");
      analyzeForm.append("voice_id", voice_id);
      analyzeForm.append("audience", audience);
      analyzeForm.append("style", style);
      analyzeForm.append("duration", String(speechDuration));

      let analyzeRes: Response;
      try {
        analyzeRes = await fetchWithTimeout(
          `${API}/analyze`,
          { method: "POST", body: analyzeForm },
          180_000
        );
      } catch {
        throw new Error("Analysis timed out. Your speech may be too long — try a shorter clip.");
      }

      setLoadingMsg("Generating your cleaned audio…");
      if (!analyzeRes.ok) {
        const err = await analyzeRes.json().catch(() => ({}));
        throw new Error(err.detail || `Analysis failed (${analyzeRes.status})`);
      }
      const result = await analyzeRes.json();

      // Store in module-level store (persists across client navigation)
      const originalUrl = URL.createObjectURL(speechBlob);
      setResult(
        {
          ...result,
          original_audio_url: originalUrl,
          api_base: API,
        },
        speechBlob
      );

      router.push("/results");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold text-gray-900 tracking-tight">VoiceUp</h1>
        <p className="text-gray-500 mt-2">Speak. Clean. Sound confident.</p>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                s === step
                  ? "bg-indigo-600 text-white"
                  : s < step
                  ? "bg-green-500 text-white"
                  : "bg-gray-200 text-gray-500"
              }`}
            >
              {s < step ? "✓" : s}
            </div>
            {s < 3 && (
              <div className={`w-10 h-0.5 ${s < step ? "bg-green-500" : "bg-gray-200"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Voice Sample */}
      {step === 1 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col gap-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Step 1: Voice Sample</h2>
            <p className="text-gray-500 text-sm mt-1">
              Read the passage below aloud — this teaches VoiceUp to sound like you.
            </p>
          </div>
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-gray-700 text-sm leading-relaxed italic">
            &ldquo;{READING_PROMPT}&rdquo;
          </div>
          <Recorder
            label="Voice Sample (~30 sec)"
            maxSeconds={60}
            minSeconds={5}
            onComplete={(blob) => setVoiceSampleBlob(blob)}
          />
          {voiceSampleBlob && (
            <button
              onClick={() => setStep(2)}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Next: Record Your Speech →
            </button>
          )}
        </div>
      )}

      {/* Step 2: Main Speech */}
      {step === 2 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col gap-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Step 2: Record Your Speech</h2>
            <p className="text-gray-500 text-sm mt-1">
              Give your pitch, presentation, or talk — up to 5 minutes.
            </p>
          </div>
          <Recorder
            label="Your Speech (up to 5 min)"
            maxSeconds={300}
            minSeconds={3}
            onComplete={(blob, duration) => {
              setSpeechBlob(blob);
              setSpeechDuration(duration);
            }}
          />
          {speechBlob && (
            <button
              onClick={() => setStep(3)}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Next: Configure Options →
            </button>
          )}
          <button
            onClick={() => setStep(1)}
            className="text-sm text-gray-400 hover:text-gray-600 underline"
          >
            ← Back
          </button>
        </div>
      )}

      {/* Step 3: Config + Process */}
      {step === 3 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col gap-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Step 3: Configure</h2>
            <p className="text-gray-500 text-sm mt-1">
              Optional: customize how your speech is cleaned.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700">Target Audience</label>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option>General</option>
                <option>Investors</option>
                <option>Technical</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700">Style</label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option>Neutral</option>
                <option>More Confident</option>
                <option>Add Humor</option>
              </select>
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
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                {loadingMsg}
              </>
            ) : (
              "Process My Speech ✨"
            )}
          </button>

          <button
            onClick={() => setStep(2)}
            className="text-sm text-gray-400 hover:text-gray-600 underline"
          >
            ← Back
          </button>
        </div>
      )}
    </main>
  );
}
