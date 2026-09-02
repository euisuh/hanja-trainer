export const PIN_ITERATIONS = 100_000;
export const PIN_SESSION_MS = 2 * 60 * 60 * 1_000;
export const PIN_COOKIE = "hanja_session";

export type PinRecord = {
  id: number;
  is_admin: number;
  pin_hash: string | null;
  pin_salt: string | null;
  pin_iterations: number | null;
  pin_secret: string | null;
  pin_failures: number;
  pin_locked_until: number | null;
};

export type PublicProfile = { id: number; name: string; hasPin: boolean; isAdmin: boolean };

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

async function findPinRecord(db: D1Database, profileId: number): Promise<PinRecord | null> {
  return db.prepare(`
    SELECT id, is_admin, pin_hash, pin_salt, pin_iterations, pin_secret, pin_failures, pin_locked_until
    FROM profile WHERE id = ?1
  `).bind(profileId).first<PinRecord>();
}

export async function readPinRecord(db: D1Database, profileId: number): Promise<PinRecord> {
  const record = await findPinRecord(db, profileId);
  if (!record) throw new PinError(404, "profile_not_found", "Profile was not found");
  return record;
}

export async function listProfiles(db: D1Database): Promise<PublicProfile[]> {
  const result = await db.prepare(`
    SELECT id, name, pin_hash IS NOT NULL AS has_pin, is_admin
    FROM profile ORDER BY id
  `).all<{ id: number; name: string; has_pin: number; is_admin: number }>();
  return result.results.map((profile) => ({
    id: profile.id,
    name: profile.name,
    hasPin: Boolean(profile.has_pin),
    isAdmin: Boolean(profile.is_admin),
  }));
}

export async function readOnlyProfile(db: D1Database): Promise<PinRecord | null> {
  const result = await db.prepare(`
    SELECT id, is_admin, pin_hash, pin_salt, pin_iterations, pin_secret, pin_failures, pin_locked_until
    FROM profile ORDER BY id LIMIT 2
  `).all<PinRecord>();
  return result.results.length === 1 ? result.results[0] : null;
}

function pinConflict(): PinError {
  return new PinError(409, "pin_conflict", "PIN changed in another request; retry");
}

function sameCredentials(left: PinRecord, right: PinRecord): boolean {
  return left.pin_hash === right.pin_hash
    && left.pin_salt === right.pin_salt
    && left.pin_iterations === right.pin_iterations
    && left.pin_secret === right.pin_secret;
}

export async function setDevicePin(
  db: D1Database,
  profileId: number,
  pin: unknown,
  currentPin: unknown,
  now = Date.now(),
  derive = derivePinHash,
): Promise<void> {
  if (!isPin(pin)) throw new PinError(400, "invalid_pin", "pin must be exactly 4 digits");
  const record = await readPinRecord(db, profileId);
  const hasPin = record.pin_hash !== null && record.pin_salt !== null && record.pin_iterations !== null;
  const hasNoPin = record.pin_hash === null && record.pin_salt === null && record.pin_iterations === null;
  if (!hasPin && !hasNoPin) throw pinConflict();
  if (hasPin && (!isPin(currentPin) || !await matchesPin(record, currentPin, derive))) {
    throw new PinError(401, "invalid_current_pin", "current PIN is incorrect");
  }
  const salt = randomBytes(16);
  const hash = await derive(pin, salt, PIN_ITERATIONS);
  const result = await db.prepare(`
    UPDATE profile SET pin_hash = ?1, pin_salt = ?2, pin_iterations = ?3, pin_secret = ?4,
      pin_failures = 0, pin_locked_until = NULL, updated_at = ?5
    WHERE id = ?6 AND pin_hash IS ?7 AND pin_salt IS ?8
      AND pin_iterations IS ?9 AND pin_secret IS ?10
  `).bind(
    base64(hash), base64(salt), PIN_ITERATIONS, base64(randomBytes(32)), now,
    profileId, record.pin_hash, record.pin_salt, record.pin_iterations, record.pin_secret,
  ).run();
  if (result.meta.changes !== 1) throw pinConflict();
}

export async function removeDevicePin(
  db: D1Database,
  profileId: number,
  currentPin: unknown,
  now = Date.now(),
  derive = derivePinHash,
): Promise<void> {
  const record = await readPinRecord(db, profileId);
  if (!record.pin_hash) throw new PinError(400, "pin_not_set", "profile PIN is not set");
  if (!isPin(currentPin) || !await matchesPin(record, currentPin, derive)) {
    throw new PinError(401, "invalid_current_pin", "current PIN is incorrect");
  }
  const result = await db.prepare(`
    UPDATE profile SET pin_hash = NULL, pin_salt = NULL, pin_iterations = NULL, pin_secret = ?1,
      pin_failures = 0, pin_locked_until = NULL, updated_at = ?2
    WHERE id = ?3 AND pin_hash IS ?4 AND pin_salt IS ?5
      AND pin_iterations IS ?6 AND pin_secret IS ?7
      AND (is_admin = 0 OR (SELECT COUNT(*) FROM profile) = 1)
  `).bind(
    base64(randomBytes(32)), now, profileId,
    record.pin_hash, record.pin_salt, record.pin_iterations, record.pin_secret,
  ).run();
  if (result.meta.changes === 1) return;
  if (!sameCredentials(record, await readPinRecord(db, profileId))) throw pinConflict();
  throw new PinError(409, "admin_pin_required", "Admin PIN is required while multiple profiles exist");
}

function cookieValue(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === PIN_COOKIE) return value.join("=");
  }
  return null;
}

function cookiePayload(value: string | null): { profileId: number; expiry: string; signature: string } | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3 || !/^\d+$/u.test(parts[0]) || !/^\d+$/u.test(parts[1])) return null;
  const profileId = Number(parts[0]);
  const expiry = Number(parts[1]);
  if (!Number.isSafeInteger(profileId) || profileId < 1 || !Number.isSafeInteger(expiry)) return null;
  return { profileId, expiry: parts[1], signature: parts[2] };
}

async function sign(payload: string, secret: string): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey("raw", decodeBase64(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

export async function verifyPinSession(record: PinRecord, cookieHeader: string | null, now: number): Promise<boolean> {
  if (!record.pin_secret) return false;
  const parsed = cookiePayload(cookieValue(cookieHeader));
  if (!parsed || parsed.profileId !== record.id || Number(parsed.expiry) <= now) return false;
  const payload = `${parsed.profileId}.${parsed.expiry}`;
  try {
    return constantTimeEqual(decodeBase64Url(parsed.signature), await sign(payload, record.pin_secret));
  } catch {
    return false;
  }
}

async function adminCanAuthenticate(db: D1Database, record: PinRecord): Promise<boolean> {
  if (!record.is_admin || record.pin_hash) return true;
  const count = await db.prepare("SELECT COUNT(*) AS count FROM profile").first<{ count: number }>();
  return count?.count === 1;
}

export async function resolveSession(db: D1Database, cookieHeader: string | null, now: number): Promise<PinRecord | null> {
  const parsed = cookiePayload(cookieValue(cookieHeader));
  if (parsed) {
    const record = await findPinRecord(db, parsed.profileId);
    if (record && await verifyPinSession(record, cookieHeader, now) && await adminCanAuthenticate(db, record)) return record;
  }
  // A lone PIN-less profile preserves the original single-profile experience.
  // Two or more profiles always require an explicit, signed selection.
  const only = await readOnlyProfile(db);
  return only && !only.pin_hash ? only : null;
}

export async function createSessionCookie(profileId: number, secret: string, now: number): Promise<string> {
  const expiry = String(now + PIN_SESSION_MS);
  const payload = `${profileId}.${expiry}`;
  return `${PIN_COOKIE}=${payload}.${base64Url(await sign(payload, secret))}; HttpOnly; Secure; SameSite=Strict; Path=/`;
}

export const clearSessionCookie = `${PIN_COOKIE}=; Max-Age=0; HttpOnly; Secure; SameSite=Strict; Path=/`;

async function ensureSessionSecret(db: D1Database, record: PinRecord, now: number): Promise<PinRecord> {
  if (record.pin_secret) return record;
  await db.prepare(`
    UPDATE profile SET pin_secret = ?1, updated_at = ?2
    WHERE id = ?3 AND pin_hash IS NULL AND pin_secret IS NULL
  `).bind(base64(randomBytes(32)), now, record.id).run();
  const current = await readPinRecord(db, record.id);
  if (current.pin_hash) throw new PinError(401, "pin_required", "Profile PIN is required");
  if (!current.pin_secret) throw new Error("Profile session secret is missing");
  return current;
}

export async function selectProfile(db: D1Database, profileId: number, now: number): Promise<string> {
  let record = await readPinRecord(db, profileId);
  if (record.pin_hash) throw new PinError(401, "pin_required", "Profile PIN is required");
  if (!await adminCanAuthenticate(db, record)) throw new PinError(409, "admin_pin_required", "Admin PIN is required while multiple profiles exist");
  record = await ensureSessionSecret(db, record, now);
  return createSessionCookie(profileId, record.pin_secret!, now);
}

function lockError(record: PinRecord, now: number): PinError | null {
  if (!record.pin_locked_until || record.pin_locked_until <= now) return null;
  const remaining = Math.ceil((record.pin_locked_until - now) / 1_000);
  return new PinError(429, "pin_locked", `Try again in ${remaining} seconds`, remaining);
}

async function updateFailures(db: D1Database, record: PinRecord, failures: number, lockedUntil: number | null): Promise<boolean> {
  const result = await db.prepare(`
    UPDATE profile SET pin_failures = ?1, pin_locked_until = ?2
    WHERE id = ?3 AND pin_hash = ?4 AND pin_secret = ?5
      AND pin_failures = ?6 AND pin_locked_until IS ?7
  `).bind(failures, lockedUntil, record.id, record.pin_hash, record.pin_secret, record.pin_failures, record.pin_locked_until).run();
  return result.meta.changes === 1;
}

export async function unlockDevice(
  db: D1Database,
  profileId: number,
  pin: unknown,
  now: number,
  derive = derivePinHash,
): Promise<string> {
  let record = await readPinRecord(db, profileId);
  let credentials = "";
  let correct = false;
  for (;;) {
    if (!record.pin_hash || !record.pin_secret) throw new PinError(400, "pin_not_set", "profile PIN is not set");
    const locked = lockError(record, now);
    if (locked) throw locked;

    const currentCredentials = `${record.pin_hash}:${record.pin_salt}:${record.pin_iterations}:${record.pin_secret}`;
    if (credentials !== currentCredentials) {
      credentials = currentCredentials;
      correct = isPin(pin) && await matchesPin(record, pin, derive);
    }

    if (correct) {
      if (await updateFailures(db, record, 0, null)) return createSessionCookie(profileId, record.pin_secret, now);
    } else {
      const failures = record.pin_failures + 1;
      const delay = failures < 5 ? 0 : Math.min(900_000, 60_000 * 2 ** Math.min(failures - 5, 4));
      const lockedUntil = delay ? now + delay : null;
      if (await updateFailures(db, record, failures, lockedUntil)) {
        if (lockedUntil) throw lockError({ ...record, pin_locked_until: lockedUntil }, now)!;
        throw new PinError(401, "invalid_pin", "PIN is incorrect");
      }
    }
    record = await readPinRecord(db, profileId);
  }
}
