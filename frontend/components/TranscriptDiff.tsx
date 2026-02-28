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

// Simple word-level diff to find which words were removed
function computeWordDiff(raw: string, cleaned: string) {
  const rawWords = raw.split(/\s+/).filter(w => w.trim());
  const cleanedWords = cleaned.split(/\s+/).filter(w => w.trim());

  // Normalize word by removing punctuation and lowercasing
  const normalize = (word: string) => word.toLowerCase().replace(/[.,!?;:"']/g, '').trim();

  // Create a map of cleaned words with their counts (using normalized keys)
  const cleanedWordMap = new Map<string, number>();
  cleanedWords.forEach(word => {
    const normalized = normalize(word);
    if (normalized) {
      cleanedWordMap.set(normalized, (cleanedWordMap.get(normalized) || 0) + 1);
    }
  });

  // Mark each raw word as removed or kept
  const result: Array<{ word: string; removed: boolean }> = [];

  rawWords.forEach(word => {
    const normalized = normalize(word);
    if (!normalized) {
      // Empty after normalization, keep it
      result.push({ word, removed: false });
      return;
    }

    const count = cleanedWordMap.get(normalized) || 0;

    if (count > 0) {
      // Word exists in cleaned, decrement count
      cleanedWordMap.set(normalized, count - 1);
      result.push({ word, removed: false });
    } else {
      // Word was removed
      result.push({ word, removed: true });
    }
  });

  return result;
}

export default function TranscriptDiff({ raw, cleaned, fillers }: TranscriptDiffProps) {
  const highlighted = useMemo(() => {
    return computeWordDiff(raw, cleaned);
  }, [raw, cleaned]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Original</p>
        <p className="text-sm text-gray-700 leading-relaxed">
          {highlighted.map((part, i) =>
            part.removed ? (
              <span key={i} className="line-through text-red-500 font-medium">
                {part.word}{" "}
              </span>
            ) : (
              <span key={i}>{part.word} </span>
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
