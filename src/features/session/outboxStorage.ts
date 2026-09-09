export function storedEntries(prefix: string): Array<[string, unknown]> {
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

export function storeEntry(prefix: string, key: string, value: unknown): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(`${prefix}${key}`, JSON.stringify(value));
    return true;
  } catch { return false; }
}

export function storeEntryIfAbsent(prefix: string, key: string, value: unknown): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    const fullKey = `${prefix}${key}`;
    if (localStorage.getItem(fullKey) === null) localStorage.setItem(fullKey, JSON.stringify(value));
    return true;
  } catch { return false; }
}

export function removeEntry(prefix: string, key: string) {
  try { localStorage.removeItem(`${prefix}${key}`); } catch { /* Storage failure must not block learning. */ }
}

export function removeEntries(prefix: string) {
  for (const [key] of storedEntries(prefix)) removeEntry(prefix, key);
}

export function decodeEntryKey(key: string): string {
  try { return decodeURIComponent(key); } catch { return key; }
}
