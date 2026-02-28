"use client";

import { useState, useMemo, useCallback, useEffect } from "react";

interface TranscriptEditorProps {
  initialText: string;
  voiceId: string;
  apiBase: string;
  onAudioRegenerated: (newAudioUrl: string) => void;
}

interface WordToken {
  id: number;
  text: string;
}

function tokenizeWords(text: string): WordToken[] {
  return text.split(/\s+/).filter(Boolean).map((word, i) => ({ id: i, text: word }));
}

export default function TranscriptEditor({
  initialText,
  voiceId,
  apiBase,
  onAudioRegenerated,
}: TranscriptEditorProps) {
  const wordTokens = useMemo(() => tokenizeWords(initialText), [initialText]);
  const [kept, setKept] = useState<boolean[]>(() => wordTokens.map(() => true));
  const [syncMode, setSyncMode] = useState<"word-driven" | "manual">("word-driven");
  const [textareaValue, setTextareaValue] = useState(initialText);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [regenerated, setRegenerated] = useState(false);

  useEffect(() => {
    setKept(wordTokens.map(() => true));
    setSyncMode("word-driven");
    setTextareaValue(initialText);
    setRegenerated(false);
  }, [initialText, wordTokens]);

  const toggleWord = useCallback(
    (idx: number) => {
      setKept((prev) => {
        const next = [...prev];
        next[idx] = !next[idx];
        if (syncMode === "word-driven") {
          const rebuilt = wordTokens
            .filter((_, i) => next[i])
            .map((t) => t.text)
            .join(" ");
          setTextareaValue(rebuilt);
        }
        return next;
      });
    },
    [syncMode, wordTokens]
  );

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTextareaValue(e.target.value);
    setSyncMode("manual");
  };

  const handleResync = () => {
    const textWords = new Set(
      textareaValue
        .toLowerCase()
        .split(/\s+/)
        .map((w) => w.replace(/[^a-z']/gi, ""))
        .filter(Boolean)
    );
    setKept(
      wordTokens.map((t) => textWords.has(t.text.toLowerCase().replace(/[^a-z']/gi, "")))
    );
    setSyncMode("word-driven");
  };

  const handleRegenerate = async () => {
    const text = textareaValue.trim();
    if (!text || !voiceId) return;
    setGenerating(true);
    setGenError(null);
    try {
      const form = new FormData();
      form.append("text", text);
      form.append("voice_id", voiceId);
      const res = await fetch(`${apiBase}/tts`, { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `TTS failed (${res.status})`);
      }
      const { audio_url } = await res.json();
      onAudioRegenerated(apiBase + audio_url);
      setRegenerated(true);
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : "Regeneration failed.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-4 rounded bg-indigo-50 border border-indigo-200" />
          kept
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-4 rounded bg-gray-100 border border-gray-200" />
          removed
        </span>
        <span className="ml-auto text-gray-400 italic hidden sm:block">Click any word to toggle it</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: clickable words */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 min-h-[140px]">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Word Toggle
          </p>
          <div className="flex flex-wrap gap-1.5 leading-relaxed">
            {wordTokens.map((tok, idx) => (
              <button
                key={tok.id}
                onClick={() => toggleWord(idx)}
                className={`px-1.5 py-0.5 rounded text-sm font-medium transition-all ${
                  kept[idx]
                    ? "text-gray-800 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100"
                    : "text-gray-400 bg-gray-100 border border-gray-200 line-through hover:bg-gray-200"
                }`}
              >
                {tok.text}
              </button>
            ))}
          </div>
        </div>

        {/* Right: editable textarea */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Edit Freely
            </p>
            {syncMode === "manual" && (
              <button
                onClick={handleResync}
                className="text-xs text-indigo-600 hover:text-indigo-800 underline"
              >
                Re-sync with words
              </button>
            )}
          </div>
          <textarea
            value={textareaValue}
            onChange={handleTextareaChange}
            rows={7}
            className="w-full border border-gray-200 rounded-xl p-3 text-sm text-gray-700 leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          />
          {syncMode === "manual" && (
            <p className="text-xs text-amber-600">
              Manual mode — word highlights may not match text.
            </p>
          )}
        </div>
      </div>

      {genError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
          {genError}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleRegenerate}
          disabled={generating || !textareaValue.trim() || !voiceId}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
        >
          {generating ? (
            <>
              <svg className="animate-spin w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Generating…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Regenerate Audio
            </>
          )}
        </button>
        {regenerated && !generating && (
          <span className="text-sm text-green-600 font-medium flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Audio updated
          </span>
        )}
      </div>
    </div>
  );
}
