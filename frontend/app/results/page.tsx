"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import AudioPlayer from "@/components/AudioPlayer";
import TranscriptDiff from "@/components/TranscriptDiff";
import { getResult, clearResult, type VoiceUpResult } from "@/lib/store";

export default function ResultsPage() {
  const router = useRouter();
  const [result, setResult] = useState<VoiceUpResult | null>(null);
  const [copied, setCopied] = useState(false);
  const cleanedAudioRef = useRef<string | null>(null);

  useEffect(() => {
    const r = getResult();
    if (r) {
      setResult(r);
      cleanedAudioRef.current = r.api_base + r.audio_url;
    }
  }, []);

  const handleStartOver = () => {
    clearResult();
    router.push("/");
  };

  const handleCopyTranscript = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.cleaned_transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!result) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-gray-500 text-lg">No results found.</p>
        <p className="text-gray-400 text-sm mt-2">Start a new session to process your speech.</p>
        <button
          onClick={() => router.push("/")}
          className="mt-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          Start Recording
        </button>
      </main>
    );
  }

  const hasWpm = result.original_wpm > 0 && result.cleaned_wpm > 0;
  const wpmDelta = hasWpm ? result.original_wpm - result.cleaned_wpm : 0;
  // Fewer words/min after cleaning = more concise, which is positive
  const improvementLabel = hasWpm
    ? wpmDelta > 0
      ? `-${Math.round((wpmDelta / result.original_wpm) * 100)}% pace`
      : `+${Math.round((Math.abs(wpmDelta) / result.original_wpm) * 100)}% pace`
    : "—";

  return (
    <main className="max-w-3xl mx-auto px-4 py-12 flex flex-col gap-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">Your Results</h1>
        <p className="text-gray-500 mt-1">Here&apos;s your cleaned-up speech</p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Fillers Removed"
          value={String(result.total_fillers)}
          highlight={result.total_fillers > 0 ? "red" : undefined}
        />
        <StatCard label="Original WPM" value={hasWpm ? String(result.original_wpm) : "—"} />
        <StatCard label="Cleaned WPM" value={hasWpm ? String(result.cleaned_wpm) : "—"} />
        <StatCard label="Pace Change" value={improvementLabel} highlight="green" />
      </div>

      {/* Audio players */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Listen &amp; Compare</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <AudioPlayer src={result.original_audio_url} label="Original" />
          <AudioPlayer
            src={cleanedAudioRef.current ?? ""}
            label="Your Cleaned Voice"
            downloadFilename="voiceup-cleaned.mp3"
          />
        </div>
      </div>

      {/* Transcript diff */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Transcript Comparison</h2>
          <button
            onClick={handleCopyTranscript}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 transition-colors"
          >
            {copied ? "✓ Copied!" : "Copy cleaned text"}
          </button>
        </div>
        <TranscriptDiff
          raw={result.raw_transcript}
          cleaned={result.cleaned_transcript}
          fillers={result.fillers}
        />
      </div>

      {/* Filler breakdown */}
      {result.fillers.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Filler Word Breakdown</h2>
          <div className="flex flex-wrap gap-2">
            {[...result.fillers]
              .sort((a, b) => b.count - a.count)
              .map((f) => (
                <span
                  key={f.word}
                  className="bg-red-50 text-red-700 border border-red-200 text-sm px-3 py-1 rounded-full font-medium"
                >
                  &ldquo;{f.word}&rdquo; &times; {f.count}
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Start over */}
      <div className="text-center">
        <button
          onClick={handleStartOver}
          className="bg-gray-800 hover:bg-gray-900 text-white font-semibold px-8 py-3 rounded-xl transition-colors"
        >
          Start Over
        </button>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "red" | "green";
}) {
  const valueColor =
    highlight === "red"
      ? "text-red-600"
      : highlight === "green"
      ? "text-green-600"
      : "text-gray-900";

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col gap-1 items-center text-center">
      <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</p>
    </div>
  );
}
