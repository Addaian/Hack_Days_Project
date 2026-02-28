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
      <main className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-500 text-lg">No results found.</p>
        <button onClick={() => router.push("/")} className="mt-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors">
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
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white py-12 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-green-500/20 border border-green-400/30 rounded-full px-4 py-1 text-green-300 text-xs font-semibold uppercase tracking-widest mb-4">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Complete
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white to-indigo-200 bg-clip-text text-transparent">
            Your Results
          </h1>
          <p className="text-slate-400 mt-2">Here&apos;s your cleaned-up speech</p>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 py-10 flex flex-col gap-8">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Fillers Removed" value={String(result.total_fillers)} accent="red" />
          <StatCard label="Original WPM" value={hasWpm ? String(result.original_wpm) : "—"} />
          <StatCard label="Words Saved" value={String(wordsSaved)} accent="green" />
          <StatCard label="Filler Rate" value={rawWordCount > 0 ? `${fillerRate}%` : "—"} accent={fillerRate > 10 ? "red" : "green"} />
        </div>

        {/* Audio players */}
        <Section title="Listen & Compare">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <AudioPlayer src={result.original_audio_url} label="Original" />
            <AudioPlayer src={cleanedAudioUrl} label="Your Cleaned Voice" downloadFilename="voiceup-cleaned.mp3" />
          </div>
        </Section>

        {/* Filler breakdown */}
        {result.fillers.length > 0 && (
          <Section title="Filler Breakdown">
            <div className="flex flex-wrap gap-2">
              {[...result.fillers].sort((a, b) => b.count - a.count).map((f) => (
                <span key={f.word} className="bg-red-50 text-red-700 border border-red-200 text-sm px-3 py-1 rounded-full font-medium">
                  &ldquo;{f.word}&rdquo; &times; {f.count}
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
            <button onClick={handleCopy} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors">
              {copied ? "✓ Copied!" : "Copy text"}
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
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            onClick={handleRedo}
            className="w-full sm:w-auto border-2 border-indigo-500 text-indigo-600 hover:bg-indigo-50 font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            ↩ Redo with Same Recording
          </button>
          <button
            onClick={handleStartOver}
            className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            Start Over
          </button>
        </div>
      </main>
    </>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: "red" | "green" }) {
  const accentBorder = accent === "red" ? "border-l-red-400" : accent === "green" ? "border-l-green-400" : "border-l-gray-200";
  const valueColor = accent === "red" ? "text-red-600" : accent === "green" ? "text-green-600" : "text-gray-900";
  return (
    <div className={`bg-white rounded-xl border border-gray-100 border-l-4 ${accentBorder} shadow-sm p-4 flex flex-col gap-1 items-center text-center`}>
      <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</p>
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
