"use client";

import { useMemo } from "react";

interface Filler {
  word: string;
  count: number;
}

interface TranscriptDiffProps {
  raw: string;
  cleaned: string;
  fillers: Filler[];
}

export default function TranscriptDiff({ raw, cleaned, fillers }: TranscriptDiffProps) {
  const fillerWords = useMemo(
    () => fillers.map((f) => f.word.toLowerCase()),
    [fillers]
  );

  const highlighted = useMemo(() => {
    if (!fillerWords.length) return [{ text: raw, isFiller: false }];

    // Sort longest first so multi-word fillers match before their component words
    const sorted = [...fillerWords].sort((a, b) => b.length - a.length);
    const pattern = sorted.map((f) => `\\b${f}\\b`).join("|");
    const regex = new RegExp(`(${pattern})`, "gi");
    const parts = raw.split(regex).filter((p) => p !== undefined);
    const fillerSet = new Set(fillerWords);

    return parts.map((part) => ({
      text: part,
      isFiller: fillerSet.has(part.toLowerCase()),
    }));
  }, [raw, fillerWords]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Original</p>
        <p className="text-sm text-gray-700 leading-relaxed">
          {highlighted.map((part, i) =>
            part.isFiller ? (
              <span key={i} className="line-through text-red-500 font-medium">
                {part.text}
              </span>
            ) : (
              <span key={i}>{part.text}</span>
            )
          )}
        </p>
      </div>
      <div className="bg-green-50 border border-green-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-3">Cleaned</p>
        <p className="text-sm text-gray-700 leading-relaxed">{cleaned}</p>
      </div>
    </div>
  );
}
