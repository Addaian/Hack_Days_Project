"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AudioPlayer from "@/components/AudioPlayer";
import TranscriptDiff from "@/components/TranscriptDiff";
import TranscriptEditor from "@/components/TranscriptEditor";
import { getResult, clearResult, clearAll, type VoiceUpResult } from "@/lib/store";

export default function ResultsPage() {
  const router = useRouter();
  const [result, setResultState] = useState<VoiceUpResult | null>(null);
  const [cleanedAudioUrl, setCleanedAudioUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const r = getResult();
    if (r) {
      setResultState(r);
      setCleanedAudioUrl(r.api_base + r.audio_url);
    }
  }, []);

  const handleRedo = () => {
    clearResult();
    router.push("/");
  };

  const handleStartOver = () => {
    clearAll();
    router.push("/");
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.cleaned_transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!result) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-24 text-center">
        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
        </div>
        <p className="text-gray-600 text-lg font-medium">No results yet</p>
        <p className="text-gray-400 text-sm mt-1">Record and process your speech to see results here.</p>
        <button
          onClick={() => router.push("/")}
          className="mt-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          Start Recording
        </button>
      </main>
    );
  }

  const hasWpm = result.original_wpm > 0;
  const rawWordCount = result.raw_transcript.trim().split(/\s+/).filter(Boolean).length;
  const cleanedWordCount = result.cleaned_transcript.trim().split(/\s+/).filter(Boolean).length;
  const wordsSaved = Math.max(0, rawWordCount - cleanedWordCount);
  const fillerRate = rawWordCount > 0 ? Math.round((result.total_fillers / rawWordCount) * 100) : 0;

  return (
    <>
      {/* Hero */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white py-14 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-green-500/20 border border-green-400/30 rounded-full px-4 py-1.5 text-green-300 text-xs font-bold uppercase tracking-widest mb-5">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Complete
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-indigo-100 to-indigo-300 bg-clip-text text-transparent pb-1">
            Your Results
          </h1>
          <p className="text-slate-400 mt-2 text-base">Here&apos;s your cleaned-up speech, ready to use.</p>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 py-10 flex flex-col gap-6">

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Fillers Removed"
            value={String(result.total_fillers)}
            icon={<path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />}
            accent="red"
          />
          <StatCard
            label="Original WPM"
            value={hasWpm ? String(result.original_wpm) : "—"}
            icon={<path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />}
            accent="default"
          />
          <StatCard
            label="Words Saved"
            value={String(wordsSaved)}
            icon={<path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />}
            accent="green"
          />
          <StatCard
            label="Filler Rate"
            value={rawWordCount > 0 ? `${fillerRate}%` : "—"}
            icon={<path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />}
            accent={fillerRate > 10 ? "red" : "green"}
          />
        </div>

        {/* Audio compare */}
        <Section title="Listen & Compare">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <AudioPlayer src={result.original_audio_url} label="Original" />
            </div>
            <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
              <AudioPlayer src={cleanedAudioUrl} label="Cleaned Voice" downloadFilename="voiceup-cleaned.mp3" />
            </div>
          </div>
        </Section>

        {/* Filler breakdown */}
        {result.fillers.length > 0 && (
          <Section title="Filler Breakdown">
            <div className="flex flex-wrap gap-2">
              {[...result.fillers].sort((a, b) => b.count - a.count).map((f) => (
                <span key={f.word} className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 border border-red-200 text-sm px-3 py-1.5 rounded-full font-medium">
                  <span className="line-through opacity-60">&ldquo;{f.word}&rdquo;</span>
                  <span className="bg-red-100 text-red-600 text-xs font-bold px-1.5 py-0.5 rounded-full">×{f.count}</span>
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Transcript diff */}
        <Section title="Original vs Cleaned">
          <TranscriptDiff
            raw={result.raw_transcript}
            cleaned={result.cleaned_transcript}
            fillers={result.fillers}
          />
        </Section>

        {/* Transcript editor */}
        <Section
          title="Edit & Regenerate"
          action={
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
            >
              {copied ? (
                <>
                  <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy text
                </>
              )}
            </button>
          }
        >
          <TranscriptEditor
            initialText={result.cleaned_transcript}
            voiceId={result.voice_id ?? ""}
            apiBase={result.api_base}
            onAudioRegenerated={(url) => setCleanedAudioUrl(url)}
          />
        </Section>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2 pb-8">
          <button
            onClick={handleRedo}
            className="w-full sm:w-auto flex items-center justify-center gap-2.5 border-2 border-indigo-300 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-400 font-bold px-8 py-3.5 rounded-xl transition-all shadow-sm hover:shadow-md group"
          >
            <svg className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Redo with Same Recording
          </button>
          <button
            onClick={handleStartOver}
            className="w-full sm:w-auto flex items-center justify-center gap-2.5 bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-900 hover:to-black text-white font-bold px-8 py-3.5 rounded-xl transition-all shadow-md hover:shadow-lg"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Start Over
          </button>
        </div>
      </main>
    </>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent = "default",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: "red" | "green" | "default";
}) {
  const borderColor = accent === "red" ? "border-l-red-400" : accent === "green" ? "border-l-emerald-400" : "border-l-indigo-200";
  const valueColor = accent === "red" ? "text-red-600" : accent === "green" ? "text-emerald-600" : "text-gray-900";
  const iconBg = accent === "red" ? "bg-red-50 text-red-400" : accent === "green" ? "bg-emerald-50 text-emerald-400" : "bg-indigo-50 text-indigo-400";
  return (
    <div className={`bg-white rounded-xl border border-gray-100 border-l-4 ${borderColor} shadow-sm p-4 flex flex-col gap-2`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg}`}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {icon}
        </svg>
      </div>
      <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
      <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold leading-tight">{label}</p>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}
