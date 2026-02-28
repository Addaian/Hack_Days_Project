export interface SavedVoice {
  voice_id: string;
  name: string;
  createdAt: number;
}

const KEY = "voiceup_voices";

export function getSavedVoices(): SavedVoice[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveVoice(voice_id: string): void {
  const voices = getSavedVoices();
  const date = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  voices.unshift({ voice_id, name: `Voice — ${date}`, createdAt: Date.now() });
  localStorage.setItem(KEY, JSON.stringify(voices.slice(0, 5)));
}

export function renameVoice(voice_id: string, name: string): void {
  const voices = getSavedVoices().map((v) =>
    v.voice_id === voice_id ? { ...v, name } : v
  );
  localStorage.setItem(KEY, JSON.stringify(voices));
}

export function deleteVoice(voice_id: string): void {
  const voices = getSavedVoices().filter((v) => v.voice_id !== voice_id);
  localStorage.setItem(KEY, JSON.stringify(voices));
}
