"use client";

import { useState } from "react";

interface AudioPlayerProps {
  src: string;
  label: string;
  downloadFilename?: string;
}

export default function AudioPlayer({ src, label, downloadFilename }: AudioPlayerProps) {
  const [loadError, setLoadError] = useState(false);

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide">{label}</p>
        {downloadFilename && src && !loadError && (
          <a
            href={src}
            download={downloadFilename}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
          >
            Download
          </a>
        )}
      </div>

      {loadError ? (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-3 text-sm text-red-600 text-center">
          Audio failed to load.{" "}
          <button
            onClick={() => setLoadError(false)}
            className="underline hover:text-red-800"
          >
            Retry
          </button>
        </div>
      ) : (
        <audio
          controls
          src={src}
          onError={() => setLoadError(true)}
          className="w-full"
        >
          Your browser does not support audio playback.
        </audio>
      )}
    </div>
  );
}
