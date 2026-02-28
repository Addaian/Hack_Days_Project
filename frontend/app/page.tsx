"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Recorder from "@/components/Recorder";
import { setResult, setRedoBlobs, getRedoBlobs, getResult } from "@/lib/store";
import { getSavedVoices, saveVoice, deleteVoice, type SavedVoice } from "@/lib/voices";

const READING_PROMPT =
  "The quick brown fox jumps over the lazy dog near the winding river. Technology shapes how we communicate, collaborate, and create meaningful work every day. New opportunities arise for those willing to learn, adapt, and persevere through challenges. Clear and confident communication builds trust, opens doors, and creates lasting impressions on the people around us. The ability to articulate ideas with precision is one of the most valuable skills anyone can develop throughout their professional career.";

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
  const [savedVoiceId, setSavedVoiceId] = useState<string | null>(null);
  const [speechBlob, setSpeechBlob] = useState<Blob | null>(null);
  const [speechDuration, setSpeechDuration] = useState(0);
  const [audiences, setAudiences] = useState<string[]>(["General"]);
  const [styles, setStyles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedVoices, setSavedVoices] = useState<SavedVoice[]>([]);
  const [showChangeRecording, setShowChangeRecording] = useState(false);

  useEffect(() => {
    setSavedVoices(getSavedVoices());

    // Redo mode: restore blobs and jump to step 3
    const { voiceSampleBlob: vsb, speechBlob: sb } = getRedoBlobs();
    const existingResult = getResult();
    if (vsb && sb) {
      setVoiceSampleBlob(vsb);
      setSpeechBlob(sb);
      if (existingResult?.speech_duration) setSpeechDuration(existingResult.speech_duration);
      if (existingResult?.voice_id) setSavedVoiceId(existingResult.voice_id);
      setStep(3);
    }
  }, []);

  const toggleAudience = (value: string) => {
    setAudiences((prev) =>
      prev.includes(value)
        ? prev.length === 1 ? prev : prev.filter((a) => a !== value)
        : [...prev, value]
    );
  };

  const toggleStyle = (value: string) => {
    setStyles((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]
    );
  };

  const handleUseSavedVoice = (voice: SavedVoice) => {
    setSavedVoiceId(voice.voice_id);
    setVoiceSampleBlob(null);
    setStep(2);
  };

  const handleDeleteVoice = (voice_id: string) => {
    deleteVoice(voice_id);
    setSavedVoices(getSavedVoices());
    if (savedVoiceId === voice_id) setSavedVoiceId(null);
  };

  const handleProcess = async () => {
    if (!speechBlob) return;
    if (!savedVoiceId && !voiceSampleBlob) return;
    setLoading(true);
    setError(null);

    try {
      setRedoBlobs(voiceSampleBlob ?? new Blob(), speechBlob);

      let voice_id = savedVoiceId;

      if (!voice_id) {
        setLoadingMsg("Cloning your voice…");
        const cloneForm = new FormData();
        cloneForm.append("voice_sample", voiceSampleBlob!, "voice_sample.webm");
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
        voice_id = (await cloneRes.json()).voice_id;
        saveVoice(voice_id!);
        setSavedVoices(getSavedVoices());
      }

      setLoadingMsg("Transcribing your speech…");
      const analyzeForm = new FormData();
      analyzeForm.append("audio", speechBlob, "speech.webm");
      analyzeForm.append("voice_id", voice_id!);
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
      setResult(
        { ...result, original_audio_url: originalUrl, api_base: API, voice_id: voice_id!, speech_duration: speechDuration },
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

  const canProceedFromStep1 = voiceSampleBlob !== null || savedVoiceId !== null;

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
                <p className="text-gray-500 text-sm mt-0.5">Read the passage aloud — this trains VoiceUp to sound like you.</p>
              </div>
            </div>

            {/* Saved voices */}
            {savedVoices.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-gray-700">Saved voices</p>
                <div className="flex flex-col gap-2">
                  {savedVoices.map((v) => (
                    <div key={v.voice_id} className={`flex items-center justify-between px-4 py-2.5 rounded-xl border transition-all cursor-pointer ${
                      savedVoiceId === v.voice_id
                        ? "bg-indigo-50 border-indigo-300"
                        : "bg-gray-50 border-gray-200 hover:border-indigo-200"
                    }`}
                      onClick={() => setSavedVoiceId(savedVoiceId === v.voice_id ? null : v.voice_id)}
                    >
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                        <span className="text-sm font-medium text-gray-700">{v.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {savedVoiceId === v.voice_id && (
                          <span className="text-xs text-indigo-600 font-semibold">Selected</span>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteVoice(v.voice_id); }}
                          className="text-gray-400 hover:text-red-500 transition-colors p-1"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-gray-400 text-xs mt-1">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span>or record a new voice</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
              </div>
            )}

            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-gray-700 text-sm leading-relaxed italic">
              &ldquo;{READING_PROMPT}&rdquo;
            </div>
            <Recorder
              label="~30 sec reading"
              maxSeconds={60}
              minSeconds={5}
              onComplete={(blob) => { setVoiceSampleBlob(blob); setSavedVoiceId(null); }}
            />
            {canProceedFromStep1 && (
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

            {/* Change recording */}
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <button
                onClick={() => setShowChangeRecording((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  {speechBlob ? "Change speech recording" : "Add speech recording"}
                </span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${showChangeRecording ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showChangeRecording && (
                <div className="px-4 pb-4 pt-2 border-t border-gray-100">
                  <Recorder
                    label="New speech recording"
                    maxSeconds={300}
                    minSeconds={3}
                    allowUpload
                    onComplete={(blob, duration) => {
                      setSpeechBlob(blob);
                      setSpeechDuration(duration);
                      setShowChangeRecording(false);
                    }}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-5">
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Target Audience</p>
                <div className="flex flex-wrap gap-2">
                  {AUDIENCES.map((a) => (
                    <button key={a} onClick={() => toggleAudience(a)}
                      className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                        audiences.includes(a)
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                          : "bg-white border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600"
                      }`}>
                      {a}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Tone <span className="font-normal text-gray-400">(optional)</span></p>
                <div className="flex flex-wrap gap-2">
                  {STYLES.map((s) => (
                    <button key={s} onClick={() => toggleStyle(s)}
                      className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                        styles.includes(s)
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                          : "bg-white border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600"
                      }`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>
            )}

            <button
              onClick={handleProcess}
              disabled={loading || !speechBlob}
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
