"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Recorder from "@/components/Recorder";
import { setResult, setRedoBlobs, getRedoBlobs, getResult } from "@/lib/store";
import { getSavedVoices, saveVoice, deleteVoice, renameVoice, type SavedVoice } from "@/lib/voices";

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

// Stop any currently playing voice preview
let activeAudio: HTMLAudioElement | null = null;

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
  const [editingVoiceId, setEditingVoiceId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);

  useEffect(() => {
    setSavedVoices(getSavedVoices());
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
      prev.includes(value) ? (prev.length === 1 ? prev : prev.filter((a) => a !== value)) : [...prev, value]
    );
  };

  const toggleStyle = (value: string) => {
    setStyles((prev) => (prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]));
  };

  const handleDeleteVoice = (voice_id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteVoice(voice_id);
    setSavedVoices(getSavedVoices());
    if (savedVoiceId === voice_id) setSavedVoiceId(null);
  };

  const startRename = (v: SavedVoice, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingVoiceId(v.voice_id);
    setEditingName(v.name);
  };

  const commitRename = (voice_id: string) => {
    const trimmed = editingName.trim();
    if (trimmed) {
      renameVoice(voice_id, trimmed);
      setSavedVoices(getSavedVoices());
    }
    setEditingVoiceId(null);
  };

  const handlePreview = async (voice_id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Toggle off if already previewing this voice
    if (previewingVoiceId === voice_id) {
      activeAudio?.pause();
      activeAudio = null;
      setPreviewingVoiceId(null);
      return;
    }
    // Stop any other playing audio
    activeAudio?.pause();
    activeAudio = null;
    setPreviewingVoiceId(voice_id);
    try {
      const form = new FormData();
      form.append("text", "Hi, this is a preview of your cloned voice. Does it sound like you?");
      form.append("voice_id", voice_id);
      const res = await fetch(`${API}/tts`, { method: "POST", body: form });
      if (!res.ok) throw new Error("Preview failed");
      const { audio_url } = await res.json();
      const audio = new Audio(API + audio_url);
      activeAudio = audio;
      audio.play();
      audio.onended = () => {
        setPreviewingVoiceId(null);
        activeAudio = null;
      };
    } catch {
      setPreviewingVoiceId(null);
    }
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
  const stepLabels = ["Voice Sample", "Your Speech", "Configure"];

  return (
    <>
      {/* Hero */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white py-16 px-4">
        <div className="max-w-xl mx-auto text-center">
          <span className="inline-flex items-center gap-1.5 bg-indigo-500/20 border border-indigo-400/30 rounded-full px-4 py-1 text-indigo-300 text-xs font-semibold uppercase tracking-widest mb-5">
            AI Speech Coach
          </span>
          <h1 className="text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white via-indigo-100 to-indigo-300 bg-clip-text text-transparent pb-1">
            VoiceUp
          </h1>
          <p className="text-slate-400 mt-3 text-lg">Speak. Clean. Sound confident.</p>

          {/* Step indicator in hero */}
          <div className="mt-10 flex items-start justify-center gap-2">
            {stepLabels.map((label, i) => {
              const s = i + 1;
              const isDone = s < step;
              const isActive = s === step;
              return (
                <div key={s} className="flex items-center gap-2">
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-200 ${
                      isActive ? "bg-indigo-500 text-white ring-4 ring-indigo-500/30"
                      : isDone ? "bg-green-500 text-white"
                      : "bg-white/10 text-white/40"
                    }`}>
                      {isDone ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : s}
                    </div>
                    <span className={`text-xs font-medium whitespace-nowrap transition-colors ${
                      isActive ? "text-white" : isDone ? "text-green-400" : "text-white/30"
                    }`}>{label}</span>
                  </div>
                  {s < 3 && (
                    <div className={`w-12 h-0.5 rounded mb-5 transition-colors ${isDone ? "bg-green-400" : "bg-white/10"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <main className="max-w-xl mx-auto px-4 py-10 flex flex-col gap-6">

        {/* ── Step 1 ── */}
        {step === 1 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-8 pt-8 pb-6 border-b border-gray-50 bg-gradient-to-r from-indigo-50/60 to-transparent">
              <h2 className="text-xl font-bold text-gray-900">Voice Sample</h2>
              <p className="text-sm text-gray-500 mt-1">This lets VoiceUp clone your voice for the final audio.</p>
            </div>

            <div className="px-8 py-6 flex flex-col gap-6">
              {/* Saved voices list */}
              {savedVoices.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Saved voices</p>
                  {savedVoices.map((v) => {
                    const isSelected = savedVoiceId === v.voice_id;
                    const isEditing = editingVoiceId === v.voice_id;
                    const isPreviewing = previewingVoiceId === v.voice_id;
                    return (
                      <div
                        key={v.voice_id}
                        onClick={() => { setSavedVoiceId(isSelected ? null : v.voice_id); setVoiceSampleBlob(null); }}
                        className={`group flex items-center gap-3 px-4 py-3 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? "bg-indigo-50 border-indigo-300 shadow-sm"
                            : "bg-gray-50/80 border-gray-200 hover:border-indigo-200 hover:bg-indigo-50/40"
                        }`}
                      >
                        {/* Radio indicator */}
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                          isSelected ? "border-indigo-500 bg-indigo-500" : "border-gray-300 group-hover:border-indigo-300"
                        }`}>
                          {isSelected && (
                            <div className="w-2 h-2 rounded-full bg-white" />
                          )}
                        </div>

                        {/* Name / edit input */}
                        <div className="flex-1 min-w-0">
                          {isEditing ? (
                            <input
                              autoFocus
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onBlur={() => commitRename(v.voice_id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitRename(v.voice_id);
                                if (e.key === "Escape") setEditingVoiceId(null);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full text-sm font-medium text-gray-800 bg-white border border-indigo-300 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                          ) : (
                            <p className="text-sm font-medium text-gray-800 truncate">{v.name}</p>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={(e) => handlePreview(v.voice_id, e)}
                            title={isPreviewing ? "Stop preview" : "Preview voice"}
                            className={`p-2 rounded-lg transition-colors ${
                              isPreviewing
                                ? "bg-indigo-100 text-indigo-600"
                                : "text-gray-400 hover:text-indigo-500 hover:bg-indigo-50"
                            }`}
                          >
                            {isPreviewing ? (
                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                <rect x="6" y="4" width="4" height="16" rx="1" />
                                <rect x="14" y="4" width="4" height="16" rx="1" />
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            )}
                          </button>
                          <button
                            onClick={(e) => startRename(v, e)}
                            title="Rename"
                            className="p-2 rounded-lg text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => handleDeleteVoice(v.voice_id, e)}
                            title="Delete"
                            className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  <div className="flex items-center gap-3 text-gray-400 text-xs my-1">
                    <div className="flex-1 h-px bg-gray-100" />
                    <span>or record a new voice</span>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                </div>
              )}

              {/* Reading prompt */}
              <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded-xl p-4">
                <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2">Read this aloud</p>
                <p className="text-gray-700 text-sm leading-relaxed italic">&ldquo;{READING_PROMPT}&rdquo;</p>
              </div>

              <Recorder
                label="~30 sec reading"
                maxSeconds={60}
                minSeconds={5}
                onComplete={(blob) => { setVoiceSampleBlob(blob); setSavedVoiceId(null); }}
              />

              {canProceedFromStep1 && (
                <button
                  onClick={() => setStep(2)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-md shadow-indigo-200 hover:shadow-lg hover:shadow-indigo-200"
                >
                  Next: Record Your Speech
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Step 2 ── */}
        {step === 2 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-8 pt-8 pb-6 border-b border-gray-50 bg-gradient-to-r from-indigo-50/60 to-transparent">
              <h2 className="text-xl font-bold text-gray-900">Record Your Speech</h2>
              <p className="text-sm text-gray-500 mt-1">Give your pitch, presentation, or talk — up to 5 minutes.</p>
            </div>

            <div className="px-8 py-6 flex flex-col gap-6">
              <Recorder
                label="Your speech (up to 5 min)"
                maxSeconds={300}
                minSeconds={3}
                allowUpload
                onComplete={(blob, duration) => { setSpeechBlob(blob); setSpeechDuration(duration); }}
              />

              {speechBlob && (
                <button
                  onClick={() => setStep(3)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-md shadow-indigo-200 hover:shadow-lg hover:shadow-indigo-200"
                >
                  Next: Configure
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}

              <button onClick={() => setStep(1)} className="text-sm text-gray-400 hover:text-gray-600 underline text-center transition-colors">
                ← Back
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3 ── */}
        {step === 3 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-8 pt-8 pb-6 border-b border-gray-50 bg-gradient-to-r from-indigo-50/60 to-transparent">
              <h2 className="text-xl font-bold text-gray-900">Configure</h2>
              <p className="text-sm text-gray-500 mt-1">Adjust options — or leave defaults for a clean, neutral result.</p>
            </div>

            <div className="px-8 py-6 flex flex-col gap-6">
              {/* Recording status pill */}
              <div className="flex items-center justify-between bg-green-50 border border-green-100 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-medium text-green-800">Speech recording ready</span>
                  {speechDuration > 0 && (
                    <span className="text-sm text-green-600">
                      · {Math.floor(speechDuration / 60)}:{(speechDuration % 60).toString().padStart(2, "0")}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setStep(2)}
                  className="text-sm text-indigo-600 hover:text-indigo-800 font-semibold transition-colors"
                >
                  Change
                </button>
              </div>

              {/* Audience */}
              <div className="flex flex-col gap-2.5">
                <p className="text-sm font-semibold text-gray-700">Target Audience</p>
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

              {/* Tone */}
              <div className="flex flex-col gap-2.5">
                <p className="text-sm font-semibold text-gray-700">
                  Tone <span className="font-normal text-gray-400">(optional)</span>
                </p>
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

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 flex items-start gap-2">
                  <svg className="w-4 h-4 shrink-0 mt-0.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  {error}
                </div>
              )}

              <button
                onClick={handleProcess}
                disabled={loading || !speechBlob}
                className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 text-base shadow-lg shadow-indigo-200/60 hover:shadow-indigo-300/60"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    {loadingMsg}
                  </>
                ) : (
                  <>
                    Process My Speech
                    <span className="text-indigo-200 text-lg">✨</span>
                  </>
                )}
              </button>

              <button onClick={() => setStep(2)} className="text-sm text-gray-400 hover:text-gray-600 underline text-center transition-colors">
                ← Back
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
