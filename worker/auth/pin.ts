export const PIN_ITERATIONS = 100_000;
export const PIN_SESSION_MS = 2 * 60 * 60 * 1_000;
export const PIN_COOKIE = "hanja_session";
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RECOVERED_SECRET_PREFIX = "recovered:";
// Pre-multi-profile cookie name (single-part expiry.signature payload, no profile
// id). Never parsed anymore -- anyone still holding one is treated as logged out
// and re-prompted for their PIN. Cleared alongside every session cookie response
// so it doesn't linger in the browser forever.
const LEGACY_PIN_COOKIE = "hanja_pin";
export const clearLegacyPinCookie = `${LEGACY_PIN_COOKIE}=; Max-Age=0; HttpOnly; Secure; SameSite=Strict; Path=/`;

export type PinRecord = {
  id: number;
  is_admin: number;
  pin_hash: string | null;
  pin_salt: string | null;
  pin_iterations: number | null;
  pin_secret: string | null;
  pin_failures: number;
  pin_locked_until: number | null;
  recovery_hash: string | null;
  recovery_salt: string | null;
  recovery_iterations: number | null;
};

export type PublicProfile = { id: number; name: string; hasPin: boolean; isAdmin: boolean };
export type PinCredentials = { hash: string; salt: string; iterations: number; secret: string };
export type UnlockResult = { token: string; recoveryCode?: string };
export type SessionCredentials = { cookie: string | null; authorization: string | null };

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

async function createHashCredentials(value: string, derive = derivePinHash): Promise<Omit<PinCredentials, "secret">> {
  const salt = randomBytes(16);
  return { hash: base64(await derive(value, salt, PIN_ITERATIONS)), salt: base64(salt), iterations: PIN_ITERATIONS };
}

export async function createPinCredentials(pin: unknown, derive = derivePinHash): Promise<PinCredentials> {
  if (!isPin(pin)) throw new PinError(400, "invalid_pin", "pin must be exactly 4 digits");
  return { ...await createHashCredentials(pin, derive), secret: base64(randomBytes(32)) };
}

async function matchesHash(value: string, hash: string | null, saltValue: string | null, iterations: number | null, derive = derivePinHash): Promise<boolean> {
  if (!hash || !saltValue || !iterations) return false;
  let stored: Uint8Array<ArrayBuffer>;
  let salt: Uint8Array<ArrayBuffer>;
  try {
    stored = decodeBase64(hash);
    salt = decodeBase64(saltValue);
  } catch {
    return false;
  }
  return constantTimeEqual(stored, await derive(value, salt, iterations));
}

async function matchesPin(record: PinRecord, pin: string, derive = derivePinHash): Promise<boolean> {
  return matchesHash(pin, record.pin_hash, record.pin_salt, record.pin_iterations, derive);
}

async function createRecoveryCredentials(derive = derivePinHash) {
  const code = Array.from(randomBytes(10), (byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length]).join("");
  return { code, ...await createHashCredentials(code, derive) };
}

async function findPinRecord(db: D1Database, profileId: number): Promise<PinRecord | null> {
  return db.prepare(`
    SELECT id, is_admin, pin_hash, pin_salt, pin_iterations, pin_secret, pin_failures, pin_locked_until,
      recovery_hash, recovery_salt, recovery_iterations
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
    SELECT id, is_admin, pin_hash, pin_salt, pin_iterations, pin_secret, pin_failures, pin_locked_until,
      recovery_hash, recovery_salt, recovery_iterations
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
    && left.pin_secret === right.pin_secret
    && left.recovery_hash === right.recovery_hash
    && left.recovery_salt === right.recovery_salt
    && left.recovery_iterations === right.recovery_iterations;
}

export async function setDevicePin(
  db: D1Database,
  profileId: number,
  pin: unknown,
  currentPin: unknown,
  now = Date.now(),
  derive = derivePinHash,
): Promise<string | null> {
  if (!isPin(pin)) throw new PinError(400, "invalid_pin", "pin must be exactly 4 digits");
  const record = await readPinRecord(db, profileId);
  const hasPin = record.pin_hash !== null && record.pin_salt !== null && record.pin_iterations !== null;
  const hasNoPin = record.pin_hash === null && record.pin_salt === null && record.pin_iterations === null;
  if (!hasPin && !hasNoPin) throw pinConflict();
  if (hasPin && (!isPin(currentPin) || !await matchesPin(record, currentPin, derive))) {
    throw new PinError(401, "invalid_current_pin", "current PIN is incorrect");
  }
  const credentials = await createPinCredentials(pin, derive);
  const recovery = record.is_admin && !hasPin ? await createRecoveryCredentials(derive) : null;
  const result = await db.prepare(`
    UPDATE profile SET pin_hash = ?1, pin_salt = ?2, pin_iterations = ?3, pin_secret = ?4,
      recovery_hash = ?5, recovery_salt = ?6, recovery_iterations = ?7,
      pin_failures = 0, pin_locked_until = NULL, updated_at = ?8
    WHERE id = ?9 AND pin_hash IS ?10 AND pin_salt IS ?11
      AND pin_iterations IS ?12 AND pin_secret IS ?13
      AND recovery_hash IS ?14 AND recovery_salt IS ?15 AND recovery_iterations IS ?16
  `).bind(
    credentials.hash, credentials.salt, credentials.iterations, credentials.secret,
    recovery?.hash ?? record.recovery_hash, recovery?.salt ?? record.recovery_salt, recovery?.iterations ?? record.recovery_iterations,
    now, profileId, record.pin_hash, record.pin_salt, record.pin_iterations, record.pin_secret,
    record.recovery_hash, record.recovery_salt, record.recovery_iterations,
  ).run();
  if (result.meta.changes !== 1) throw pinConflict();
  return recovery?.code ?? null;
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
      recovery_hash = NULL, recovery_salt = NULL, recovery_iterations = NULL,
      pin_failures = 0, pin_locked_until = NULL, updated_at = ?2
    WHERE id = ?3 AND pin_hash IS ?4 AND pin_salt IS ?5
      AND pin_iterations IS ?6 AND pin_secret IS ?7
      AND recovery_hash IS ?8 AND recovery_salt IS ?9 AND recovery_iterations IS ?10
      AND (is_admin = 0 OR (SELECT COUNT(*) FROM profile) = 1)
  `).bind(
    base64(randomBytes(32)), now, profileId,
    record.pin_hash, record.pin_salt, record.pin_iterations, record.pin_secret,
    record.recovery_hash, record.recovery_salt, record.recovery_iterations,
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
  const encoded = secret.startsWith(RECOVERED_SECRET_PREFIX) ? secret.slice(RECOVERED_SECRET_PREFIX.length) : secret;
  const key = await crypto.subtle.importKey("raw", decodeBase64(encoded), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

// Native clients cannot use the SameSite=Strict cookie, so they present the same
// signed token as `Authorization: Bearer <token>`.
export function bearerToken(header: string | null): string | null {
  return /^Bearer ([^\s]+)$/iu.exec(header ?? "")?.[1] ?? null;
}

async function verifyPinSession(record: PinRecord, token: string | null, now: number): Promise<boolean> {
  if (!record.pin_secret) return false;
  const parsed = cookiePayload(token);
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
  if (record.pin_secret?.startsWith(RECOVERED_SECRET_PREFIX)) return true;
  const count = await db.prepare("SELECT COUNT(*) AS count FROM profile").first<{ count: number }>();
  return count?.count === 1;
}

export async function resolveSession(db: D1Database, credentials: SessionCredentials, now: number): Promise<PinRecord | null> {
  // Any Authorization header is a bearer attempt: it never falls back to the
  // cookie or to the lone PIN-less profile, so a bad token is always rejected.
  const bearer = credentials.authorization !== null;
  const token = bearer ? bearerToken(credentials.authorization) : cookieValue(credentials.cookie);
  const parsed = cookiePayload(token);
  if (parsed) {
    const record = await findPinRecord(db, parsed.profileId);
    if (record && await verifyPinSession(record, token, now) && await adminCanAuthenticate(db, record)) return record;
  }
  if (bearer) return null;
  // A lone PIN-less profile preserves the original single-profile experience.
  // Two or more profiles always require an explicit, signed selection.
  const only = await readOnlyProfile(db);
  return only && !only.pin_hash ? only : null;
}

export async function createSessionToken(profileId: number, secret: string, now: number): Promise<string> {
  const expiry = String(now + PIN_SESSION_MS);
  const payload = `${profileId}.${expiry}`;
  return `${payload}.${base64Url(await sign(payload, secret))}`;
}

export function sessionCookie(token: string): string {
  return `${PIN_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/`;
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
  return createSessionToken(profileId, record.pin_secret!, now);
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

type CredentialKind = "pin" | "recovery";

function credentialFingerprint(record: PinRecord, kind: CredentialKind): string {
  return kind === "pin"
    ? `${record.pin_hash}:${record.pin_salt}:${record.pin_iterations}:${record.pin_secret}`
    : `${record.recovery_hash}:${record.recovery_salt}:${record.recovery_iterations}:${record.pin_secret}`;
}

async function credentialMatches(record: PinRecord, kind: CredentialKind, value: unknown, derive = derivePinHash): Promise<boolean> {
  if (kind === "pin") return isPin(value) && await matchesPin(record, value, derive);
  return Boolean(record.is_admin) && typeof value === "string"
    && await matchesHash(value, record.recovery_hash, record.recovery_salt, record.recovery_iterations, derive);
}

async function authenticate<T>(
  db: D1Database,
  profileId: number,
  kind: CredentialKind,
  value: unknown,
  now: number,
  success: (record: PinRecord) => Promise<T | null>,
  derive = derivePinHash,
): Promise<T> {
  let record = await readPinRecord(db, profileId);
  let credentials = "";
  let correct = false;
  for (;;) {
    if (!record.pin_hash || !record.pin_secret) throw new PinError(400, "pin_not_set", "profile PIN is not set");
    const locked = lockError(record, now);
    if (locked) throw locked;

    const currentCredentials = credentialFingerprint(record, kind);
    if (credentials !== currentCredentials) {
      credentials = currentCredentials;
      correct = await credentialMatches(record, kind, value, derive);
    }

    if (correct) {
      const result = await success(record);
      if (result !== null) return result;
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

export async function unlockDevice(
  db: D1Database,
  profileId: number,
  pin: unknown,
  now: number,
  derive = derivePinHash,
): Promise<UnlockResult> {
  let recovery: Awaited<ReturnType<typeof createRecoveryCredentials>> | null = null;
  return authenticate(db, profileId, "pin", pin, now, async (record) => {
    if (record.is_admin && record.recovery_hash === null) {
      recovery ??= await createRecoveryCredentials(derive);
      const result = await db.prepare(`
        UPDATE profile SET recovery_hash = ?1, recovery_salt = ?2, recovery_iterations = ?3,
          pin_failures = 0, pin_locked_until = NULL
        WHERE id = ?4 AND is_admin = 1 AND pin_hash = ?5 AND pin_secret = ?6
          AND recovery_hash IS NULL AND pin_failures = ?7 AND pin_locked_until IS ?8
      `).bind(
        recovery.hash, recovery.salt, recovery.iterations, record.id, record.pin_hash,
        record.pin_secret, record.pin_failures, record.pin_locked_until,
      ).run();
      if (result.meta.changes === 1) {
        return { token: await createSessionToken(profileId, record.pin_secret!, now), recoveryCode: recovery.code };
      }
      return null;
    }
    return await updateFailures(db, record, 0, null)
      ? { token: await createSessionToken(profileId, record.pin_secret!, now) }
      : null;
  }, derive);
}

export async function recoverAdminPin(
  db: D1Database,
  profileId: number,
  code: unknown,
  now: number,
  derive = derivePinHash,
): Promise<string> {
  let secret = "";
  return authenticate(db, profileId, "recovery", code, now, async (record) => {
    secret ||= `${RECOVERED_SECRET_PREFIX}${base64(randomBytes(32))}`;
    const result = await db.prepare(`
      UPDATE profile SET pin_hash = NULL, pin_salt = NULL, pin_iterations = NULL,
        pin_secret = ?1, recovery_hash = NULL, recovery_salt = NULL, recovery_iterations = NULL,
        pin_failures = 0, pin_locked_until = NULL, updated_at = ?2
      WHERE id = ?3 AND is_admin = 1 AND pin_hash = ?4 AND pin_secret = ?5
        AND recovery_hash = ?6 AND recovery_salt = ?7 AND recovery_iterations = ?8
        AND pin_failures = ?9 AND pin_locked_until IS ?10
    `).bind(
      secret, now, record.id, record.pin_hash, record.pin_secret,
      record.recovery_hash, record.recovery_salt, record.recovery_iterations,
      record.pin_failures, record.pin_locked_until,
    ).run();
    return result.meta.changes === 1 ? createSessionToken(profileId, secret, now) : null;
  }, derive);
}
