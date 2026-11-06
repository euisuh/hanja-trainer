/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-conditional-empty-object-spread -- Existing profile-management HTTP boundary predates changed-file lint; parseCreateProfile/parseRenameProfile validate every key. */
import type { ManagedProfile } from "../../shared/api";
import { createPinCredentials, derivePinHash, isPin, type PinCredentials } from "../auth/pin";

// Kept in sync by hand with the `profile_limit` trigger's `>= 5` in
// migrations/0017_multi_profile.sql (SQLite triggers can't reference a JS
// constant). Changing this value requires a new migration updating the
// trigger's WHEN clause to match -- editing 0017 in place is a no-op against
// a database that already applied it.
const PROFILE_LIMIT = 5;
// Exact text of the trigger's `RAISE(ABORT, ...)` message -- must match
// migrations/0017_multi_profile.sql's `profile_limit` trigger verbatim.
const PROFILE_LIMIT_TRIGGER_MESSAGE = "profile limit reached";

type AdminRow = { is_admin: number; pin_hash: string | null; profile_count: number };
type ProfileRow = { id: number; name: string; is_admin: number };

export type CreateProfileInput = { name: string; pin?: string };
export type RenameProfileInput = { name: string };

export class ProfileError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function graphemeLength(value: string): number {
  return [...graphemeSegmenter.segment(value)].length;
}

function normalizedName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name && graphemeLength(name) <= 24 ? name : null;
}

function hasOnlyKeys(body: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(body).every((key) => allowed.includes(key));
}

function parseCreateProfile(value: unknown): CreateProfileInput | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (!hasOnlyKeys(body, ["name", "pin"])) return null;
  const name = normalizedName(body.name);
  if (!name || (body.pin !== undefined && !isPin(body.pin))) return null;
  return { name, ...(body.pin === undefined ? {} : { pin: body.pin }) };
}

function parseRenameProfile(value: unknown): RenameProfileInput | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (!hasOnlyKeys(body, ["name"])) return null;
  const name = normalizedName(body.name);
  return name ? { name } : null;
}

function managedProfile(row: ProfileRow): ManagedProfile {
  return { id: row.id, name: row.name, isAdmin: Boolean(row.is_admin) };
}

async function requireAdmin(db: D1Database, callerId: number): Promise<AdminRow> {
  const row = await db.prepare(`
    SELECT is_admin, pin_hash, (SELECT COUNT(*) FROM profile WHERE is_demo = 0) AS profile_count
    FROM profile WHERE id = ?1
  `).bind(callerId).first<AdminRow>();
  if (!row?.is_admin) throw new ProfileError(403, "admin_required", "An admin profile is required");
  return row;
}

function profileLimitError(caught: unknown): boolean {
  return String(caught instanceof Error ? caught.message : caught).includes(PROFILE_LIMIT_TRIGGER_MESSAGE);
}

export async function createProfile(db: D1Database, callerId: number, rawInput: unknown, now = Date.now(), derive = derivePinHash): Promise<ManagedProfile> {
  // Admin check runs before body-shape validation so a non-admin caller always
  // gets 403, even with a malformed/privileged-looking payload -- never 400.
  const admin = await requireAdmin(db, callerId);
  const input = parseCreateProfile(rawInput);
  if (!input) throw new ProfileError(400, "invalid_profile", "name or PIN is invalid");
  if (!admin.pin_hash) throw new ProfileError(409, "admin_pin_required", "Set an admin PIN before adding another profile");
  if (admin.profile_count >= PROFILE_LIMIT) throw new ProfileError(409, "profile_limit", `At most ${PROFILE_LIMIT} profiles are allowed`);
  const credentials: PinCredentials | null = input.pin ? await createPinCredentials(input.pin, derive) : null;
  try {
    const created = await db.prepare(`
      INSERT INTO profile (
        name, is_admin, onboarded_at, pin_hash, pin_salt, pin_iterations,
        pin_secret, pin_failures, pin_locked_until, created_at, updated_at
      )
      SELECT ?1, 0, NULL, ?2, ?3, ?4, ?5, 0, NULL, ?6, ?6
      FROM profile AS admin
      WHERE admin.id = ?7 AND admin.is_admin = 1 AND admin.pin_hash IS NOT NULL
      RETURNING id, name, is_admin
    `).bind(
      input.name,
      credentials?.hash ?? null,
      credentials?.salt ?? null,
      credentials?.iterations ?? null,
      credentials?.secret ?? null,
      now,
      callerId,
    ).first<ProfileRow>();
    if (!created) throw new ProfileError(409, "admin_pin_required", "Admin PIN changed; retry after signing in");
    return managedProfile(created);
  } catch (caught) {
    if (caught instanceof ProfileError) throw caught;
    if (profileLimitError(caught)) throw new ProfileError(409, "profile_limit", `At most ${PROFILE_LIMIT} profiles are allowed`);
    throw caught;
  }
}

export async function renameProfile(db: D1Database, callerId: number, targetId: number, rawInput: unknown, now = Date.now()): Promise<ManagedProfile> {
  // Same ordering as createProfile: admin check before body-shape validation.
  await requireAdmin(db, callerId);
  const input = parseRenameProfile(rawInput);
  if (!input) throw new ProfileError(400, "invalid_profile", "name is invalid");
  const renamed = await db.prepare(`
    UPDATE profile SET name = ?1, updated_at = ?2 WHERE id = ?3
    RETURNING id, name, is_admin
  `).bind(input.name, now, targetId).first<ProfileRow>();
  if (!renamed) throw new ProfileError(404, "profile_not_found", "Profile was not found");
  return managedProfile(renamed);
}

export async function deleteProfile(db: D1Database, callerId: number, targetId: number): Promise<void> {
  await requireAdmin(db, callerId);
  if (targetId === callerId) throw new ProfileError(409, "profile_self_delete", "The active admin profile cannot be deleted");
  const target = await db.prepare("SELECT id, is_admin FROM profile WHERE id = ?1").bind(targetId).first<{ id: number; is_admin: number }>();
  if (!target) throw new ProfileError(404, "profile_not_found", "Profile was not found");
  if (target.is_admin) throw new ProfileError(409, "admin_profile_protected", "The admin profile cannot be deleted");
  const result = await db.prepare("DELETE FROM profile WHERE id = ?1 AND is_admin = 0").bind(targetId).run();
  if (result.meta.changes !== 1) throw new ProfileError(404, "profile_not_found", "Profile was not found");
}
