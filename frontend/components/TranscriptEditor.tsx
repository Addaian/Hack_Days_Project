"use client";

import { useState, useEffect } from "react";

interface TranscriptEditorProps {
  initialText: string;
  voiceId: string;
  apiBase: string;
  onAudioRegenerated: (newAudioUrl: string) => void;
}

export default function TranscriptEditor({
  initialText,
  voiceId,
  apiBase,
  onAudioRegenerated,
}: TranscriptEditorProps) {
  const [text, setText] = useState(initialText);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [regenerated, setRegenerated] = useState(false);

  useEffect(() => {
    setText(initialText);
    setRegenerated(false);
  }, [initialText]);

  const handleRegenerate = async () => {
    const trimmed = text.trim();
    if (!trimmed || !voiceId) return;
    setGenerating(true);
    setGenError(null);
    try {
      const form = new FormData();
      form.append("text", trimmed);
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
    <div className="flex flex-col gap-3">
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setRegenerated(false); }}
        rows={7}
        className="w-full border border-gray-200 rounded-xl p-3 text-sm text-gray-700 leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
        placeholder="Edit your cleaned transcript here…"
      />

      {genError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
          {genError}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleRegenerate}
          disabled={generating || !text.trim() || !voiceId}
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
