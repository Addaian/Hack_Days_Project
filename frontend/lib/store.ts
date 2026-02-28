/**
 * Module-level store for persisting VoiceUp results across client-side navigation.
 * Next.js App Router doesn't remount the root during client nav, so this stays alive.
 */

export interface FillerEntry {
  word: string;
  count: number;
}

export interface VoiceUpResult {
  raw_transcript: string;
  cleaned_transcript: string;
  fillers: FillerEntry[];
  total_fillers: number;
  original_wpm: number;
  cleaned_wpm: number;
  audio_url: string;
  original_audio_url: string; // blob: URL — valid as long as this module is in memory
  api_base: string;
}

let _result: VoiceUpResult | null = null;
let _originalBlob: Blob | null = null;

export function setResult(result: VoiceUpResult, originalBlob: Blob) {
  _result = result;
  _originalBlob = originalBlob;
}

export function getResult(): VoiceUpResult | null {
  return _result;
}

export function getOriginalBlob(): Blob | null {
  return _originalBlob;
}

export function clearResult() {
  if (_result?.original_audio_url) {
    URL.revokeObjectURL(_result.original_audio_url);
  }
  _result = null;
  _originalBlob = null;
}
