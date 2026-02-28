"use client";

import { useRef, useState, useEffect } from "react";

interface RecorderProps {
  onComplete: (blob: Blob, durationSeconds: number) => void;
  maxSeconds?: number;
  minSeconds?: number;
  label: string;
}

function getSupportedMimeType(): string {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  for (const type of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "";
}

export default function Recorder({
  onComplete,
  maxSeconds,
  minSeconds = 2,
  label,
}: RecorderProps) {
  const [status, setStatus] = useState<"idle" | "recording" | "done">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const elapsedRef = useRef(0); // track elapsed without stale closure

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startRecording = async () => {
    setError(null);

    if (!navigator?.mediaDevices?.getUserMedia) {
      setError("Your browser doesn't support audio recording. Try Chrome or Firefox.");
      return;
    }

    const mimeType = getSupportedMimeType();
    if (!mimeType) {
      setError("Your browser doesn't support audio recording. Try Chrome or Firefox.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      elapsedRef.current = 0;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        onComplete(blob, elapsedRef.current);
        setStatus("done");
      };

      mr.start(250);
      setStatus("recording");
      setElapsed(0);

      intervalRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setElapsed(elapsedRef.current);
        if (maxSeconds && elapsedRef.current >= maxSeconds) {
          stopRecording();
        }
      }, 1000);
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("Microphone access denied. Please allow mic access and try again.");
      } else {
        setError("Could not start recording. Make sure a microphone is connected.");
      }
    }
  };

  const stopRecording = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const reset = () => {
    setStatus("idle");
    setElapsed(0);
    elapsedRef.current = 0;
    setError(null);
    chunksRef.current = [];
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const tooShort = status === "recording" && elapsed < minSeconds;

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">{label}</p>

      {error && (
        <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-md text-center max-w-xs">
          {error}
        </p>
      )}

      {status === "idle" && (
        <button
          onClick={startRecording}
          className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white font-semibold px-6 py-3 rounded-full transition-colors"
        >
          <span className="w-3 h-3 bg-white rounded-full" />
          Start Recording
        </button>
      )}

      {status === "recording" && (
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-red-500 font-mono text-xl font-semibold">
            <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            {formatTime(elapsed)}
            {maxSeconds && (
              <span className="text-gray-400 text-sm font-normal">/ {formatTime(maxSeconds)}</span>
            )}
          </div>
          <button
            onClick={stopRecording}
            disabled={tooShort}
            className="bg-gray-800 hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-2 rounded-full transition-colors"
          >
            {tooShort ? `Hold on… (${minSeconds - elapsed}s)` : "Stop"}
          </button>
        </div>
      )}

      {status === "done" && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-green-600 font-semibold">✓ Recorded ({formatTime(elapsed)})</p>
          <button onClick={reset} className="text-sm text-gray-500 underline hover:text-gray-700">
            Re-record
          </button>
        </div>
      )}
    </div>
  );
}
