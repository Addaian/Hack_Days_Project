"use client";

import { useRef, useState, useEffect } from "react";

interface RecorderProps {
  onComplete: (blob: Blob, durationSeconds: number) => void;
  maxSeconds?: number;
  minSeconds?: number;
  label: string;
  allowUpload?: boolean;
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
  allowUpload = false,
}: RecorderProps) {
  const [status, setStatus] = useState<"idle" | "recording" | "done">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const elapsedRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
        if (maxSeconds && elapsedRef.current >= maxSeconds) stopRecording();
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
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
  };

  const reset = () => {
    setStatus("idle");
    setElapsed(0);
    elapsedRef.current = 0;
    setError(null);
    chunksRef.current = [];
    setUploadedFileName(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    const arrayBuffer = await file.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: file.type || "audio/mpeg" });
    const tempUrl = URL.createObjectURL(blob);
    const audio = new Audio(tempUrl);

    audio.addEventListener("loadedmetadata", () => {
      const dur = isFinite(audio.duration) ? Math.round(audio.duration) : 0;
      URL.revokeObjectURL(tempUrl);
      setUploadedFileName(file.name);
      setElapsed(dur);
      elapsedRef.current = dur;
      setStatus("done");
      onComplete(blob, dur);
    });
    audio.addEventListener("error", () => {
      URL.revokeObjectURL(tempUrl);
      setError("Could not read audio file. Make sure it's a valid audio format.");
    });
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  const tooShort = status === "recording" && elapsed < minSeconds;

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{label}</p>

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-xl text-center max-w-xs">
          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {error}
        </div>
      )}

      {status === "idle" && (
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={startRecording}
            className="flex items-center gap-2.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold px-8 py-3.5 rounded-full transition-all shadow-lg shadow-red-200/50 hover:shadow-xl hover:shadow-red-300/50 hover:scale-105"
          >
            <span className="w-3 h-3 bg-white rounded-full animate-pulse" />
            Start Recording
          </button>
          {allowUpload && (
            <>
              <div className="flex items-center gap-3 text-gray-300 text-xs w-full max-w-xs">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-gray-400 font-medium">or</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <label className="cursor-pointer group flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-semibold transition-all px-6 py-2.5 rounded-xl border-2 border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Upload audio file
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  className="sr-only"
                  onChange={handleFileUpload}
                />
              </label>
            </>
          )}
        </div>
      )}

      {status === "recording" && (
        <div className="flex flex-col items-center gap-4">
          <div className="flex flex-col items-center gap-3 bg-gradient-to-br from-red-50 to-orange-50 border-2 border-red-200 px-8 py-6 rounded-2xl shadow-lg">
            <div className="flex items-center gap-3 text-red-600 font-mono text-3xl font-bold">
              <span className="w-4 h-4 bg-red-500 rounded-full animate-pulse shadow-lg shadow-red-300" />
              {formatTime(elapsed)}
            </div>
            {maxSeconds && (
              <span className="text-gray-500 text-sm font-medium">of {formatTime(maxSeconds)}</span>
            )}
          </div>
          <button
            onClick={stopRecording}
            disabled={tooShort}
            className="bg-gray-900 hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-8 py-3 rounded-full transition-all shadow-md hover:shadow-lg"
          >
            {tooShort ? `Hold on… (${minSeconds - elapsed}s)` : "Stop Recording"}
          </button>
        </div>
      )}

      {status === "done" && (
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-3 text-green-700 font-semibold bg-green-50 border border-green-200 px-5 py-3 rounded-xl shadow-sm">
            <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex flex-col">
              <span className="text-sm">
                {uploadedFileName ? "File uploaded" : "Recording complete"}
              </span>
              <span className="text-xs text-green-600">
                {uploadedFileName || `${formatTime(elapsed)} duration`}
              </span>
            </div>
          </div>
          <button onClick={reset} className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-semibold underline underline-offset-2 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {uploadedFileName ? "Upload different file" : "Re-record"}
          </button>
        </div>
      )}
    </div>
  );
}
