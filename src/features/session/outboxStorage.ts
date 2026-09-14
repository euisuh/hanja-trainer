import { load as storedEntries, set as storeEntry, remove as removeEntry } from "../../platform/storage";

export { storedEntries, storeEntry, removeEntry };

export function storeEntryIfAbsent(prefix: string, key: string, value: unknown): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    const fullKey = `${prefix}${key}`;
    if (localStorage.getItem(fullKey) === null) return storeEntry(prefix, key, value);
    return true;
  } catch { return false; }
}

export function removeEntries(prefix: string) {
  for (const [key] of storedEntries(prefix)) removeEntry(prefix, key);
}

export function decodeEntryKey(key: string): string {
  try { return decodeURIComponent(key); } catch { return key; }
}
