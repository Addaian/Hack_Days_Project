export interface FillerEntry {
  word: string;
  count: number;
}

export interface AltoResult {
  raw_transcript: string;
  cleaned_transcript: string;
  fillers: FillerEntry[];
  total_fillers: number;
  original_wpm: number;
  cleaned_wpm: number;
  audio_url: string;
  original_audio_url: string;
  api_base: string;
  voice_id?: string;
  speech_duration?: number;
}

let _result: AltoResult | null = null;
let _originalBlob: Blob | null = null;
let _voiceSampleBlob: Blob | null = null;
let _speechBlob: Blob | null = null;

export function setResult(result: AltoResult, originalBlob: Blob) {
  _result = result;
  _originalBlob = originalBlob;
}

export function setRedoBlobs(voiceSampleBlob: Blob, speechBlob: Blob) {
  _voiceSampleBlob = voiceSampleBlob;
  _speechBlob = speechBlob;
}

export function getRedoBlobs(): { voiceSampleBlob: Blob | null; speechBlob: Blob | null } {
  return { voiceSampleBlob: _voiceSampleBlob, speechBlob: _speechBlob };
}

export function getResult(): AltoResult | null {
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

export function clearAll() {
  clearResult();
  _voiceSampleBlob = null;
  _speechBlob = null;
}
