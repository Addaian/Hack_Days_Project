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

/**
 * Tokenize text into segments, marking each token as either a filler or not.
 * Handles multi-word fillers (e.g. "you know") by scanning ahead.
 */
function tokenize(text: string, fillerSet: Set<string>): { text: string; isFiller: boolean }[] {
  // Split preserving whitespace as separate tokens
  const words = text.split(/(\s+)/);
  const result: { text: string; isFiller: boolean }[] = [];
  let i = 0;

  while (i < words.length) {
    const token = words[i];

    // Skip whitespace tokens — just push them
    if (/^\s+$/.test(token)) {
      result.push({ text: token, isFiller: false });
      i++;
      continue;
    }

    // Strip punctuation for comparison only
    const clean = token.toLowerCase().replace(/[^a-z]/g, "");

    // Try to match a multi-word filler starting here (look ahead up to 3 words)
    let matched = false;
    for (let len = 3; len >= 2; len--) {
      // Gather `len` word tokens (skip whitespace when building phrase)
      const wordTokens: string[] = [];
      const indices: number[] = [];
      let j = i;
      while (wordTokens.length < len && j < words.length) {
        if (!/^\s+$/.test(words[j])) {
          wordTokens.push(words[j].toLowerCase().replace(/[^a-z]/g, ""));
          indices.push(j);
        }
        j++;
      }
      if (wordTokens.length === len) {
        const phrase = wordTokens.join(" ");
        if (fillerSet.has(phrase)) {
          // Collect all tokens (including whitespace) from i to j
          const combined = words.slice(i, j).join("");
          result.push({ text: combined, isFiller: true });
          i = j;
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      result.push({ text: token, isFiller: fillerSet.has(clean) });
      i++;
    }
  }

  return result;
}

export default function TranscriptDiff({ raw, cleaned, fillers }: TranscriptDiffProps) {
  const fillerSet = useMemo(
    () => new Set(fillers.map((f) => f.word.toLowerCase())),
    [fillers]
  );

  const tokens = useMemo(() => tokenize(raw, fillerSet), [raw, fillerSet]);

  return (
    <div className="flex flex-col gap-3">
      {/* Legend */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="line-through text-red-500 font-medium">word</span>
        <span>= filler word removed</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Original with highlights */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Original
          </h3>
          <p className="text-sm text-gray-700 leading-relaxed">
            {tokens.map((tok, i) =>
              tok.isFiller ? (
                <span key={i} className="line-through text-red-500 font-medium">
                  {tok.text}
                </span>
              ) : (
                <span key={i}>{tok.text}</span>
              )
            )}
          </p>
        </div>

        {/* Cleaned */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-3">
            Cleaned
          </h3>
          <p className="text-sm text-gray-700 leading-relaxed">{cleaned}</p>
        </div>
      </div>
    </div>
  );
}
