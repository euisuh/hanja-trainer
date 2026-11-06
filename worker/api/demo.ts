import { createSessionToken, GUEST_IDLE_MS, GUEST_MAX_AGE_MS, PinError, randomSecret } from "../auth/pin";

export const DEMO_LIVE_CAP = 200;
export const DEMO_PER_CLIENT_PER_HOUR = 5;
// Lifetime write budget per guest profile (a lesson of eight cards is about ten writes).
export const DEMO_WRITE_QUOTA = 2_000;
const HOUR_MS = 60 * 60 * 1_000;

async function clientKey(ip: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`hanja-demo:${ip}`)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// ponytail: purge runs lazily on each create instead of a cron; idle guests are
// already rejected by resolveSession, so a late purge only costs storage.
export async function createDemoSession(db: D1Database, ip: string, now: number): Promise<string> {
  // Keyed on server-owned times only (never updated_at, which other routes stamp).
  await db.prepare(`
    DELETE FROM profile WHERE is_demo = 1 AND (demo_active_at IS NULL OR demo_active_at <= ?1 OR created_at <= ?2)
  `).bind(now - GUEST_IDLE_MS, now - GUEST_MAX_AGE_MS).run();
  const client = await clientKey(ip);
  const secret = randomSecret();
  // One statement so concurrent creates cannot overshoot either limit.
  const created = await db.prepare(`
    INSERT INTO profile (name, is_admin, is_demo, demo_client, enabled_tracks, onboarded_at, pin_secret, created_at, updated_at, demo_active_at)
    SELECT '게스트', 0, 1, ?1, '["jp"]', ?2, ?3, ?2, ?2, ?2
    WHERE (SELECT COUNT(*) FROM profile WHERE is_demo = 1) < ?4
      AND (SELECT COUNT(*) FROM profile WHERE is_demo = 1 AND demo_client = ?1 AND created_at > ?5) < ?6
    RETURNING id
  `).bind(client, now, secret, DEMO_LIVE_CAP, now - HOUR_MS, DEMO_PER_CLIENT_PER_HOUR).first<{ id: number }>();
  if (created) return createSessionToken(created.id, secret, now, GUEST_IDLE_MS);
  const live = await db.prepare("SELECT COUNT(*) AS count FROM profile WHERE is_demo = 1").first<{ count: number }>();
  if ((live?.count ?? 0) >= DEMO_LIVE_CAP) throw new PinError(503, "demo_capacity", "The demo is full; try again later", 3_600);
  throw new PinError(429, "demo_rate_limited", "Too many demo sessions; try again later", 3_600);
}

// Sliding expiry, validated and extended in one statement: false when the guest
// is gone or already expired (e.g. purged after the caller resolved it).
export async function touchGuest(db: D1Database, profileId: number, now: number): Promise<boolean> {
  const result = await db.prepare(`
    UPDATE profile SET demo_active_at = ?1
    WHERE id = ?2 AND is_demo = 1 AND demo_active_at > ?3 AND created_at > ?4
  `).bind(now, profileId, now - GUEST_IDLE_MS, now - GUEST_MAX_AGE_MS).run();
  return result.meta.changes === 1;
}

export async function consumeDemoWrite(db: D1Database, profileId: number): Promise<void> {
  const result = await db.prepare(`
    UPDATE profile SET demo_writes = demo_writes + 1 WHERE id = ?1 AND is_demo = 1 AND demo_writes < ?2
  `).bind(profileId, DEMO_WRITE_QUOTA).run();
  if (result.meta.changes !== 1) throw new PinError(429, "demo_quota", "The demo write quota is used up");
}
