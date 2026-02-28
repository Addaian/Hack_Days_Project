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
const STYLES = ["More Confident", "Humorous", "Sad"] as const;

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
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);

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
      setPreviewLoading(null);
      return;
    }
    // Stop any other playing audio
    activeAudio?.pause();
    activeAudio = null;
    setPreviewLoading(voice_id);
    try {
      const form = new FormData();
      form.append("text", "Hi, this is a preview of your cloned voice. Does it sound like you?");
      form.append("voice_id", voice_id);
      const res = await fetch(`${API}/tts`, { method: "POST", body: form });
      if (!res.ok) throw new Error("Preview failed");
      const { audio_url } = await res.json();
      const audio = new Audio(API + audio_url);
      activeAudio = audio;
      setPreviewLoading(null);
      setPreviewingVoiceId(voice_id);
      audio.play();
      audio.onended = () => {
        setPreviewingVoiceId(null);
        activeAudio = null;
      };
    } catch {
      setPreviewingVoiceId(null);
      setPreviewLoading(null);
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
      <div className="relative bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 border-b border-amber-200/50 py-20 px-4 overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute inset-0 opacity-[0.03]">
          <div className="absolute top-10 left-10 w-72 h-72 bg-amber-900 rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-rose-900 rounded-full blur-3xl"></div>
        </div>

        <div className="max-w-xl mx-auto text-center relative">
          {/* Microphone icon */}
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-amber-600 to-orange-600 rounded-2xl shadow-lg shadow-amber-900/20 mb-6 rotate-3">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>

          <span className="inline-flex items-center gap-2 bg-white/80 backdrop-blur-sm border border-amber-300/50 rounded-full px-5 py-2 text-amber-900 text-xs font-bold uppercase tracking-widest mb-6 shadow-sm">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            Public Speaking Coach
          </span>
          <h1 className="font-display text-6xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-amber-900 via-orange-800 to-amber-900 pb-1 leading-tight">
            Alto
          </h1>
          <p className="font-serif text-amber-900/70 mt-4 text-xl italic">Master the art of confident communication</p>

          {/* Step indicator in hero */}
          <div className="mt-12 flex items-start justify-center gap-3">
            {stepLabels.map((label, i) => {
              const s = i + 1;
              const isDone = s < step;
              const isActive = s === step;
              return (
                <div key={s} className="flex items-center gap-3">
                  <div className="flex flex-col items-center gap-2">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-200 shadow-md ${
                      isActive ? "bg-amber-700 text-white ring-4 ring-amber-400/30 scale-110"
                      : isDone ? "bg-emerald-600 text-white"
                      : "bg-white/60 text-amber-900/40 backdrop-blur-sm"
                    }`}>
                      {isDone ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : s}
                    </div>
                    <span className={`text-xs font-semibold whitespace-nowrap transition-colors ${
                      isActive ? "text-amber-900" : isDone ? "text-emerald-700" : "text-amber-900/40"
                    }`}>{label}</span>
                  </div>
                  {s < 3 && (
                    <div className={`w-12 h-1 rounded-full mb-6 transition-colors ${isDone ? "bg-emerald-400" : "bg-amber-900/20"}`} />
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
          <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-lg shadow-amber-900/5 border border-amber-200/50 overflow-hidden">
            <div className="px-8 pt-8 pb-6 border-b border-amber-100/50 bg-gradient-to-r from-amber-50/80 via-orange-50/40 to-transparent">
              <h2 className="font-display text-2xl font-bold text-amber-950">Voice Sample</h2>
              <p className="font-serif text-sm text-amber-900/60 mt-1.5">Capture your unique voice for authentic reproduction</p>
            </div>

            <div className="px-8 py-6 flex flex-col gap-6">
              {/* Saved voices list */}
              {savedVoices.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Saved voices</p>
                    <span className="text-xs text-gray-400">{savedVoices.length} saved</span>
                  </div>
                  {savedVoices.map((v) => {
                    const isSelected = savedVoiceId === v.voice_id;
                    const isEditing = editingVoiceId === v.voice_id;
                    const isPreviewing = previewingVoiceId === v.voice_id;
                    const isLoadingPreview = previewLoading === v.voice_id;
                    return (
                      <div
                        key={v.voice_id}
                        onClick={() => { setSavedVoiceId(isSelected ? null : v.voice_id); setVoiceSampleBlob(null); }}
                        className={`group flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all duration-200 cursor-pointer ${
                          isSelected
                            ? "bg-indigo-50 border-indigo-400 shadow-md shadow-indigo-100/50 scale-[1.02]"
                            : "bg-white border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40 hover:shadow-sm"
                        }`}
                      >
                        {/* Radio indicator with animation */}
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-200 ${
                          isSelected ? "border-indigo-500 bg-indigo-500 scale-110" : "border-gray-300 group-hover:border-indigo-400"
                        }`}>
                          {isSelected && (
                            <div className="w-2 h-2 rounded-full bg-white animate-[pulse_2s_ease-in-out_infinite]" />
                          )}
                        </div>

                        {/* Voice icon */}
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                          isSelected ? "bg-indigo-100 text-indigo-600" : "bg-gray-100 text-gray-400 group-hover:bg-indigo-50 group-hover:text-indigo-500"
                        }`}>
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          </svg>
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
                              className="w-full text-sm font-semibold text-gray-900 bg-white border border-indigo-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            />
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              <p className="text-sm font-semibold text-gray-900 truncate">{v.name}</p>
                              <p className="text-xs text-gray-400">
                                {new Date(v.createdAt).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit"
                                })}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => handlePreview(v.voice_id, e)}
                            disabled={isLoadingPreview}
                            title={isPreviewing ? "Stop preview" : isLoadingPreview ? "Loading preview..." : "Preview voice"}
                            className={`p-2.5 rounded-lg transition-all duration-200 disabled:opacity-60 ${
                              isPreviewing
                                ? "bg-indigo-600 text-white shadow-sm"
                                : isLoadingPreview
                                ? "bg-indigo-100 text-indigo-400"
                                : "text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
                            }`}
                          >
                            {isLoadingPreview ? (
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                              </svg>
                            ) : isPreviewing ? (
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <rect x="6" y="4" width="4" height="16" rx="1" />
                                <rect x="14" y="4" width="4" height="16" rx="1" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            )}
                          </button>
                          <button
                            onClick={(e) => startRename(v, e)}
                            title="Rename voice"
                            className="p-2.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all duration-200"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => handleDeleteVoice(v.voice_id, e)}
                            title="Delete voice"
                            className="p-2.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all duration-200"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
              <div className="relative bg-gradient-to-br from-amber-100/80 via-orange-100/60 to-rose-100/70 border-2 border-amber-300/50 rounded-2xl p-6 shadow-lg shadow-amber-900/5 backdrop-blur-sm">
                <div className="absolute top-5 right-5 opacity-5">
                  <svg className="w-12 h-12 text-amber-900" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
                  </svg>
                </div>
                <p className="font-display text-sm font-bold text-amber-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                  Practice Script
                </p>
                <p className="font-serif text-amber-950/90 text-base leading-relaxed italic relative z-10">&ldquo;{READING_PROMPT}&rdquo;</p>
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
                  className="w-full bg-gradient-to-r from-amber-700 to-orange-700 hover:from-amber-800 hover:to-orange-800 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2.5 shadow-lg shadow-amber-900/20 hover:shadow-xl hover:shadow-amber-900/30 hover:scale-[1.02] group"
                >
                  Next: Record Your Speech
                  <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Step 2 ── */}
        {step === 2 && (
          <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-lg shadow-amber-900/5 border border-amber-200/50 overflow-hidden">
            <div className="px-8 pt-8 pb-6 border-b border-amber-100/50 bg-gradient-to-r from-amber-50/80 via-orange-50/40 to-transparent">
              <h2 className="font-display text-2xl font-bold text-amber-950">Record Your Speech</h2>
              <p className="font-serif text-sm text-amber-900/60 mt-1.5">Share your presentation, pitch, or public address</p>
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
                  className="w-full bg-gradient-to-r from-amber-700 to-orange-700 hover:from-amber-800 hover:to-orange-800 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2.5 shadow-lg shadow-amber-900/20 hover:shadow-xl hover:shadow-amber-900/30 hover:scale-[1.02] group"
                >
                  Next: Configure
                  <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}

              <button onClick={() => setStep(1)} className="flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium text-center transition-colors group">
                <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Back to Voice Sample
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3 ── */}
        {step === 3 && (
          <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-lg shadow-amber-900/5 border border-amber-200/50 overflow-hidden">
            <div className="px-8 pt-8 pb-6 border-b border-amber-100/50 bg-gradient-to-r from-amber-50/80 via-orange-50/40 to-transparent">
              <h2 className="font-display text-2xl font-bold text-amber-950">Configure & Refine</h2>
              <p className="font-serif text-sm text-amber-900/60 mt-1.5">Tailor your message for maximum impact</p>
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
                  onClick={() => { setSpeechBlob(null); setSpeechDuration(0); }}
                  className="text-sm text-indigo-600 hover:text-indigo-800 font-semibold transition-colors"
                >
                  Change
                </button>
              </div>

              {/* Re-record/upload section (shown when changing) */}
              {!speechBlob && (
                <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl p-6">
                  <p className="text-sm font-semibold text-indigo-900 mb-4">Record or upload your speech</p>
                  <Recorder
                    label="Your speech (up to 5 min)"
                    maxSeconds={300}
                    minSeconds={3}
                    allowUpload
                    onComplete={(blob, duration) => { setSpeechBlob(blob); setSpeechDuration(duration); }}
                  />
                </div>
              )}

              {/* Audience */}
              <div className="flex flex-col gap-3">
                <p className="font-display text-sm font-bold text-amber-950 flex items-center gap-2">
                  <svg className="w-4 h-4 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Target Audience
                </p>
                <div className="flex flex-wrap gap-2.5">
                  {AUDIENCES.map((a) => (
                    <button
                      key={a}
                      onClick={() => toggleAudience(a)}
                      className={`px-5 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all duration-200 ${
                        audiences.includes(a)
                          ? "bg-amber-700 border-amber-700 text-white shadow-md shadow-amber-900/20 scale-105"
                          : "bg-white border-amber-200 text-amber-900 hover:border-amber-400 hover:text-amber-800 hover:shadow-sm"
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tone */}
              <div className="flex flex-col gap-3">
                <p className="font-display text-sm font-bold text-amber-950 flex items-center gap-2">
                  <svg className="w-4 h-4 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Tone
                  <span className="font-serif text-xs font-normal text-amber-700/60 ml-1 italic">(optional)</span>
                </p>
                <div className="flex flex-wrap gap-2.5">
                  {STYLES.map((s) => (
                    <button
                      key={s}
                      onClick={() => toggleStyle(s)}
                      className={`px-5 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all duration-200 ${
                        styles.includes(s)
                          ? "bg-amber-700 border-amber-700 text-white shadow-md shadow-amber-900/20 scale-105"
                          : "bg-white border-amber-200 text-amber-900 hover:border-amber-400 hover:text-amber-800 hover:shadow-sm"
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
                disabled={loading || !speechBlob || (!savedVoiceId && !voiceSampleBlob)}
                className="w-full bg-gradient-to-r from-amber-700 via-orange-700 to-amber-800 hover:from-amber-800 hover:via-orange-800 hover:to-amber-900 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 text-white font-bold py-4.5 rounded-xl transition-all flex items-center justify-center gap-2.5 text-base shadow-xl shadow-amber-900/30 hover:shadow-2xl hover:shadow-amber-900/40 hover:scale-[1.02]"
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
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Process My Speech
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </>
                )}
              </button>

              {!savedVoiceId && !voiceSampleBlob && (
                <div className="text-center text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 flex items-center gap-2 justify-center">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Go back to Step 1 to select or record a voice sample
                </div>
              )}

              <button onClick={() => setStep(2)} className="flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium text-center transition-colors group">
                <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Back to Recording
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
