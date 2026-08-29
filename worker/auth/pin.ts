export const PIN_ITERATIONS = 600_000;
export const PIN_SESSION_MS = 2 * 60 * 60 * 1_000;
export const PIN_COOKIE = "hanja_pin";

export type PinRecord = {
  pin_hash: string | null;
  pin_salt: string | null;
  pin_iterations: number | null;
  pin_secret: string | null;
  pin_failures: number;
  pin_locked_until: number | null;
};

export class PinError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly retryAfter?: number) {
    super(message);
  }
}

const encoder = new TextEncoder();

function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function base64Url(bytes: Uint8Array): string {
  return base64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  return decodeBase64(value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

function constantTimeEqual(left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean {
  const subtle = crypto.subtle as SubtleCrypto & { timingSafeEqual?: (a: BufferSource, b: BufferSource) => boolean };
  if (left.length === right.length && subtle.timingSafeEqual) return subtle.timingSafeEqual.call(subtle, left, right);
  // Node's Web Crypto lacks timingSafeEqual; production Workers always use the branch above.
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

export function isPin(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}$/u.test(value);
}

export async function derivePinHash(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

async function matchesPin(record: PinRecord, pin: string, derive = derivePinHash): Promise<boolean> {
  if (!record.pin_hash || !record.pin_salt || !record.pin_iterations) return false;
  let stored: Uint8Array<ArrayBuffer>;
  let salt: Uint8Array<ArrayBuffer>;
  try {
    stored = decodeBase64(record.pin_hash);
    salt = decodeBase64(record.pin_salt);
  } catch {
    return false;
  }
  return constantTimeEqual(stored, await derive(pin, salt, record.pin_iterations));
}

export async function readPinRecord(db: D1Database): Promise<PinRecord> {
  const record = await db.prepare(`
    SELECT pin_hash, pin_salt, pin_iterations, pin_secret, pin_failures, pin_locked_until
    FROM profile WHERE id = 1
  `).first<PinRecord>();
  if (!record) throw new Error("Profile row is missing");
  return record;
}

export async function setDevicePin(db: D1Database, pin: unknown, currentPin: unknown, now = Date.now()): Promise<void> {
  if (!isPin(pin)) throw new PinError(400, "invalid_pin", "pin must be exactly 4 digits");
  const record = await readPinRecord(db);
  if (record.pin_hash && (!isPin(currentPin) || !await matchesPin(record, currentPin))) {
    throw new PinError(401, "invalid_current_pin", "current PIN is incorrect");
  }
  const salt = randomBytes(16);
  const hash = await derivePinHash(pin, salt, PIN_ITERATIONS);
  await db.prepare(`
    UPDATE profile SET pin_hash = ?1, pin_salt = ?2, pin_iterations = ?3, pin_secret = ?4,
      pin_failures = 0, pin_locked_until = NULL, updated_at = ?5 WHERE id = 1
  `).bind(base64(hash), base64(salt), PIN_ITERATIONS, base64(randomBytes(32)), now).run();
}

export async function removeDevicePin(db: D1Database, currentPin: unknown, now = Date.now()): Promise<void> {
  const record = await readPinRecord(db);
  if (!record.pin_hash) throw new PinError(400, "pin_not_set", "device PIN is not set");
  if (!isPin(currentPin) || !await matchesPin(record, currentPin)) {
    throw new PinError(401, "invalid_current_pin", "current PIN is incorrect");
  }
  await db.prepare(`
    UPDATE profile SET pin_hash = NULL, pin_salt = NULL, pin_iterations = NULL, pin_secret = NULL,
      pin_failures = 0, pin_locked_until = NULL, updated_at = ?1 WHERE id = 1
  `).bind(now).run();
}

function cookieValue(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === PIN_COOKIE) return value.join("=");
  }
  return null;
}

async function sign(expiry: string, secret: string): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey("raw", decodeBase64(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(expiry)));
}

export async function verifyPinSession(record: PinRecord, cookieHeader: string | null, now: number): Promise<boolean> {
  if (!record.pin_secret) return false;
  const value = cookieValue(cookieHeader);
  if (!value) return false;
  const separator = value.indexOf(".");
  if (separator < 1) return false;
  const expiry = value.slice(0, separator);
  if (!/^\d+$/u.test(expiry) || Number(expiry) <= now) return false;
  try {
    return constantTimeEqual(decodeBase64Url(value.slice(separator + 1)), await sign(expiry, record.pin_secret));
  } catch {
    return false;
  }
}

export async function createSessionCookie(secret: string, now: number): Promise<string> {
  const expiry = String(now + PIN_SESSION_MS);
  return `${PIN_COOKIE}=${expiry}.${base64Url(await sign(expiry, secret))}; HttpOnly; Secure; SameSite=Strict; Path=/`;
}

export const clearSessionCookie = `${PIN_COOKIE}=; Max-Age=0; HttpOnly; Secure; SameSite=Strict; Path=/`;

function lockError(record: PinRecord, now: number): PinError | null {
  if (!record.pin_locked_until || record.pin_locked_until <= now) return null;
  const remaining = Math.ceil((record.pin_locked_until - now) / 1_000);
  return new PinError(429, "pin_locked", `Try again in ${remaining} seconds`, remaining);
}

async function updateFailures(db: D1Database, record: PinRecord, failures: number, lockedUntil: number | null): Promise<boolean> {
  const result = await db.prepare(`
    UPDATE profile SET pin_failures = ?1, pin_locked_until = ?2
    WHERE id = 1 AND pin_hash = ?3 AND pin_secret = ?4
      AND pin_failures = ?5 AND pin_locked_until IS ?6
  `).bind(failures, lockedUntil, record.pin_hash, record.pin_secret, record.pin_failures, record.pin_locked_until).run();
  return result.meta.changes === 1;
}

export async function unlockDevice(
  db: D1Database,
  pin: unknown,
  now: number,
  derive = derivePinHash,
): Promise<string> {
  let record = await readPinRecord(db);
  let credentials = "";
  let correct = false;
  for (;;) {
    if (!record.pin_hash || !record.pin_secret) throw new PinError(400, "pin_not_set", "device PIN is not set");
    const locked = lockError(record, now);
    if (locked) throw locked;

    const currentCredentials = `${record.pin_hash}:${record.pin_salt}:${record.pin_iterations}:${record.pin_secret}`;
    if (credentials !== currentCredentials) {
      credentials = currentCredentials;
      correct = isPin(pin) && await matchesPin(record, pin, derive);
    }

    if (correct) {
      if (await updateFailures(db, record, 0, null)) return createSessionCookie(record.pin_secret, now);
    } else {
      const failures = record.pin_failures + 1;
      const delay = failures < 5 ? 0 : Math.min(900_000, 60_000 * 2 ** Math.min(failures - 5, 4));
      const lockedUntil = delay ? now + delay : null;
      if (await updateFailures(db, record, failures, lockedUntil)) {
        if (lockedUntil) throw lockError({ ...record, pin_locked_until: lockedUntil }, now)!;
        throw new PinError(401, "invalid_pin", "PIN is incorrect");
      }
    }
    record = await readPinRecord(db);
  }
}
