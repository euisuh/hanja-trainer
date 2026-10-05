/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-array-filter-map -- Existing native storage adapter predates changed-file lint; this adds an outbox prefix only. */
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { createWriteQueue } from "./writeQueue";

const outboxPrefixes = [
  "hanja-trainer:pending-conversation-attempts:",
  "hanja-trainer:pending-reviews:",
  "hanja-trainer:pending-session-summaries:",
];
const writes = createWriteQueue();

function mirror(key: string, value: string | null) {
  if (!Capacitor.isNativePlatform() || !outboxPrefixes.some((prefix) => key.startsWith(prefix))) return;
  // Keep a slow set from finishing after the acknowledgement removes the same key.
  // ponytail: one write queue for both small outboxes; use SQLite if volume grows.
  writes.enqueue(() => value === null ? Preferences.remove({ key }) : Preferences.set({ key, value }), "Could not mirror offline work to native storage.");
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

const RESTORE_TIMEOUT_MS = 2_000;

// Call before importing App: creating either outbox rehydrates it at module load.
// Bounded so a slow or hung bridge never keeps the app from rendering; localStorage
// stays the primary copy and anything not restored in time is retried next launch.
//
// Known limit (accepted in issue 307): removals reach native storage asynchronously. If the app is
// killed after a local removal but before its native removal, and iOS later evicts WebView
// storage, the restore brings the entry back. Pending entries are then re-sent and the server
// deduplicates them; a discarded rejection reappears and must be discarded again. Deleting
// native rows that look stale was rejected: without synchronous proof of the discard it can
// delete the only copy of a real rejection (for example after localStorage quota failures).
export async function restoreOutboxStorage(timeoutMs = RESTORE_TIMEOUT_MS): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const restore = { cancelled: false };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      restore.cancelled = true;
      console.warn("Native offline storage restore timed out; continuing without it.");
      resolve();
    }, timeoutMs);
  });
  await Promise.race([restoreFromNative(restore), timedOut]);
  clearTimeout(timer);
}

async function restoreFromNative(restore: { cancelled: boolean }): Promise<void> {
  await writes.idle();
  if (restore.cancelled) return;
  const nativeValues = new Map<string, string>();
  try {
    const { keys } = await Preferences.keys();
    await Promise.all(keys.filter((key) => outboxPrefixes.some((prefix) => key.startsWith(prefix))).map(async (key) => {
      try {
        const { value } = await Preferences.get({ key });
        if (value === null) return;
        nativeValues.set(key, value);
        // After a timeout the app may already own localStorage; never write behind it.
        if (!restore.cancelled && localStorage.getItem(key) === null) localStorage.setItem(key, value);
      } catch { console.warn("Could not restore an offline entry from native storage."); }
    }));
  } catch { console.warn("Could not read native offline storage."); }
  if (restore.cancelled) return;

  // Back up entries from older app builds too, preserving local values on conflicts. Runs on
  // the mirror queue so a later removal can never be overtaken by this backup.
  const backups = outboxPrefixes.flatMap((prefix) => load(prefix).map(([suffix]) => `${prefix}${suffix}`))
    .map((key) => [key, localStorage.getItem(key)] as const)
    .filter((entry): entry is readonly [string, string] => entry[1] !== null && nativeValues.get(entry[0]) !== entry[1]);
  if (backups.length === 0) return;
  writes.enqueue(() => Promise.all(backups.map(([key, value]) => Preferences.set({ key, value })
    .catch(() => { console.warn("Could not back up an offline entry to native storage."); }))), "Could not back up offline entries to native storage.");
  await writes.idle();
}
