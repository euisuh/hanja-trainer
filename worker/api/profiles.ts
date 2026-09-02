import type { ManagedProfile } from "../../src/shared/api";
import { createPinCredentials, derivePinHash, isPin, type PinCredentials } from "../auth/pin";

const PROFILE_LIMIT = 5;

type AdminRow = { is_admin: number; pin_hash: string | null; profile_count: number };
type ProfileRow = { id: number; name: string; is_admin: number };

export type CreateProfileInput = { name: string; pin?: string };
export type RenameProfileInput = { name: string };

export class ProfileError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

function normalizedName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name && [...name].length <= 24 ? name : null;
}

function hasOnlyKeys(body: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(body).every((key) => allowed.includes(key));
}

export function parseCreateProfile(value: unknown): CreateProfileInput | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (!hasOnlyKeys(body, ["name", "pin"])) return null;
  const name = normalizedName(body.name);
  if (!name || (body.pin !== undefined && !isPin(body.pin))) return null;
  return { name, ...(body.pin === undefined ? {} : { pin: body.pin }) };
}

export function parseRenameProfile(value: unknown): RenameProfileInput | null {
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
    SELECT is_admin, pin_hash, (SELECT COUNT(*) FROM profile) AS profile_count
    FROM profile WHERE id = ?1
  `).bind(callerId).first<AdminRow>();
  if (!row?.is_admin) throw new ProfileError(403, "admin_required", "An admin profile is required");
  return row;
}

export async function assertProfileAdmin(db: D1Database, callerId: number): Promise<void> {
  await requireAdmin(db, callerId);
}

function profileLimitError(caught: unknown): boolean {
  return String(caught instanceof Error ? caught.message : caught).includes("profile limit reached");
}

export async function createProfile(db: D1Database, callerId: number, input: CreateProfileInput, now = Date.now(), derive = derivePinHash): Promise<ManagedProfile> {
  const admin = await requireAdmin(db, callerId);
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

export async function renameProfile(db: D1Database, callerId: number, targetId: number, input: RenameProfileInput, now = Date.now()): Promise<ManagedProfile> {
  await requireAdmin(db, callerId);
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
  await db.prepare("DELETE FROM profile WHERE id = ?1 AND is_admin = 0").bind(targetId).run();
}
