import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const outboxPrefixes = [
  "hanja-trainer:pending-reviews:",
  "hanja-trainer:pending-session-summaries:",
];
let writes = Promise.resolve();

function mirror(key: string, value: string | null) {
  if (!Capacitor.isNativePlatform() || !outboxPrefixes.some((prefix) => key.startsWith(prefix))) return;
  // Keep a slow set from finishing after the acknowledgement removes the same key.
  // ponytail: one write queue for both small outboxes; use SQLite if volume grows.
  writes = writes.then(() => value === null ? Preferences.remove({ key }) : Preferences.set({ key, value }))
    .catch(() => { console.warn("Could not mirror offline work to native storage."); });
}

export function load(prefix: string): Array<[string, unknown]> {
  try {
    if (typeof localStorage === "undefined") return [];
    const found: Array<[string, unknown]> = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      try { found.push([key.slice(prefix.length), JSON.parse(raw)]); }
      catch { found.push([key.slice(prefix.length), raw]); }
    }
    return found;
  } catch { return []; }
}

export function set(prefix: string, key: string, value: unknown): boolean {
  try {
    const raw = JSON.stringify(value);
    mirror(`${prefix}${key}`, raw);
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(`${prefix}${key}`, raw);
    return true;
  } catch { return false; }
}

export function remove(prefix: string, key: string) {
  mirror(`${prefix}${key}`, null);
  try { localStorage.removeItem(`${prefix}${key}`); } catch { /* Storage failure must not block learning. */ }
}

// Call before importing App: creating either outbox rehydrates it at module load.
export async function restoreOutboxStorage(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await writes;
  try {
    const { keys } = await Preferences.keys();
    for (const key of keys) {
      if (!outboxPrefixes.some((prefix) => key.startsWith(prefix))) continue;
      try {
        const { value } = await Preferences.get({ key });
        if (value !== null && localStorage.getItem(key) === null) localStorage.setItem(key, value);
      } catch { console.warn("Could not restore an offline entry from native storage."); }
    }
  } catch { console.warn("Could not read native offline storage."); }

  // Back up entries from older app builds too, preserving local values on conflicts.
  for (const prefix of outboxPrefixes) {
    for (const [suffix] of load(prefix)) {
      try {
        const key = `${prefix}${suffix}`;
        const value = localStorage.getItem(key);
        if (value !== null) await Preferences.set({ key, value });
      } catch { console.warn("Could not back up an offline entry to native storage."); }
    }
  }
}
