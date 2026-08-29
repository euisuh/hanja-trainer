import type { UnitTestAnswer, UnitTestResult } from "../../src/shared/api";
import { TRACKS, type Track } from "../../src/shared/types";
import { getCurriculumContent } from "./content";

type UnitRow = { track: Track };
type ProfileRow = { enabled_tracks: string };
type MemberRow = { character_id: number; key: string };
type ExpectedAnswer = { characterKey: string; answerIndex: number };
type AttemptRow = { session_id: string; unit_id: number; expected_answers: string; expires_at: number; consumed_at: number | null };

export const UNIT_TEST_ATTEMPT_TTL_MS = 30 * 60 * 1_000;

export class UnitTestError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

function enabledTracks(json: string): Track[] {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new Error("Profile enabled tracks are invalid"); }
  const tracks = Array.isArray(parsed) ? TRACKS.filter((track) => parsed.includes(track)) : [];
  if (tracks.length === 0) throw new Error("Profile has no enabled tracks");
  return tracks;
}

export async function requireUnitTestTarget(db: D1Database, unitId: number, requestedTrack?: Track): Promise<Track> {
  const [unit, profile] = await Promise.all([
    db.prepare("SELECT track FROM curriculum_units WHERE id = ?1").bind(unitId).first<UnitRow>(),
    db.prepare("SELECT enabled_tracks FROM profile WHERE id = 1").first<ProfileRow>(),
  ]);
  if (!unit) throw new UnitTestError(404, "unit_not_found", "Curriculum unit was not found");
  if (!profile) throw new Error("Profile row is missing");
  if (requestedTrack !== undefined && unit.track !== requestedTrack) {
    throw new UnitTestError(400, "unit_track_mismatch", "Curriculum unit does not belong to the requested track");
  }
  if (!enabledTracks(profile.enabled_tracks).includes(unit.track)) {
    throw new UnitTestError(409, "unit_track_disabled", "Curriculum unit track is not enabled");
  }
  const target = (await getCurriculumContent(db, unit.track)).units.find((candidate) => candidate.id === unitId);
  if (!target) throw new UnitTestError(404, "unit_not_found", "Curriculum unit was not found");
  if (target.nodes.every((node) => node.state === "done")) {
    throw new UnitTestError(409, "unit_already_complete", "Curriculum unit is already complete");
  }
  if (!target.current) throw new UnitTestError(409, "unit_not_current", "Only the current curriculum unit can be tested out");
  return unit.track;
}

export async function issueUnitTestAttempt(db: D1Database, sessionId: string, unitId: number, expected: ExpectedAnswer[], now = Date.now()): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM curriculum_unit_test_attempts WHERE expires_at <= ?1").bind(now),
    db.prepare("DELETE FROM curriculum_unit_test_attempts WHERE unit_id = ?1").bind(unitId),
    db.prepare(`
      INSERT INTO curriculum_unit_test_attempts
        (session_id, unit_id, expected_answers, created_at, expires_at, consumed_at, consumed_token)
      VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL)
    `).bind(sessionId, unitId, JSON.stringify(expected), now, now + UNIT_TEST_ATTEMPT_TTL_MS),
  ]);
}

export function parseUnitTestSubmission(value: unknown): { sessionId: string; answers: UnitTestAnswer[] } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.sessionId !== "string" || body.sessionId.length === 0 || body.sessionId.length > 128) return null;
  if (!Array.isArray(body.answers) || body.answers.length > 1_000) return null;
  const answers: UnitTestAnswer[] = [];
  for (const answer of body.answers) {
    if (typeof answer !== "object" || answer === null || Array.isArray(answer)) return null;
    const record = answer as Record<string, unknown>;
    if (!Number.isInteger(record.cardIndex) || (record.cardIndex as number) < 0 || (record.cardIndex as number) > 1_000) return null;
    if (typeof record.characterKey !== "string" || record.characterKey.length === 0 || record.characterKey.length > 32) return null;
    if (record.selectedIndex !== null && (!Number.isInteger(record.selectedIndex) || (record.selectedIndex as number) < 0 || (record.selectedIndex as number) > 3)) return null;
    answers.push({ cardIndex: record.cardIndex as number, characterKey: record.characterKey, selectedIndex: record.selectedIndex as number | null });
  }
  return { sessionId: body.sessionId, answers };
}

function decodeExpected(json: string): ExpectedAnswer[] {
  const value: unknown = JSON.parse(json);
  if (!Array.isArray(value) || !value.every((answer) => typeof answer === "object" && answer !== null
    && typeof (answer as Record<string, unknown>).characterKey === "string"
    && Number.isInteger((answer as Record<string, unknown>).answerIndex))) {
    throw new Error("Unit test attempt has invalid expected answers");
  }
  return value as ExpectedAnswer[];
}

async function consumeAttempt(db: D1Database, attempt: AttemptRow, members: MemberRow[], passed: boolean, now: number): Promise<void> {
  const token = crypto.randomUUID();
  const statements = [db.prepare(`
    UPDATE curriculum_unit_test_attempts
    SET consumed_at = ?3, consumed_token = ?4
    WHERE session_id = ?1 AND unit_id = ?2 AND consumed_at IS NULL AND expires_at > ?3
    RETURNING session_id
  `).bind(attempt.session_id, attempt.unit_id, now, token)];
  if (passed) {
    statements.push(...members.map((member) => db.prepare(`
      INSERT INTO curriculum_unit_completion_members (unit_id, character_id, completed_at)
      SELECT ?1, ?2, ?3
      WHERE EXISTS (
        SELECT 1 FROM curriculum_unit_test_attempts
        WHERE session_id = ?4 AND unit_id = ?1 AND consumed_token = ?5
      )
      ON CONFLICT(unit_id, character_id) DO NOTHING
    `).bind(attempt.unit_id, member.character_id, now, attempt.session_id, token)));
  }
  const [claim] = await db.batch(statements);
  if (claim.results.length === 0) throw new UnitTestError(409, "unit_test_replayed", "Unit test attempt was already consumed");
}

export async function completeUnitTest(db: D1Database, unitId: number, sessionId: string, answers: UnitTestAnswer[], now = Date.now()): Promise<UnitTestResult> {
  const attempt = await db.prepare(`
    SELECT session_id, unit_id, expected_answers, expires_at, consumed_at
    FROM curriculum_unit_test_attempts
    WHERE session_id = ?1 AND unit_id = ?2
  `).bind(sessionId, unitId).first<AttemptRow>();
  if (!attempt) {
    const other = await db.prepare("SELECT unit_id FROM curriculum_unit_test_attempts WHERE session_id = ?1 LIMIT 1").bind(sessionId).first<{ unit_id: number }>();
    if (other) throw new UnitTestError(409, "unit_test_wrong_unit", "Unit test attempt belongs to another unit");
    throw new UnitTestError(404, "unit_test_attempt_not_found", "Unit test attempt was not found");
  }
  if (attempt.consumed_at !== null) throw new UnitTestError(409, "unit_test_replayed", "Unit test attempt was already consumed");
  if (attempt.expires_at <= now) throw new UnitTestError(410, "unit_test_expired", "Unit test attempt has expired");

  await requireUnitTestTarget(db, unitId);
  const members = await db.prepare(`
    SELECT cum.character_id, c.key
    FROM curriculum_unit_members cum
    JOIN characters c ON c.id = cum.character_id
    WHERE cum.unit_id = ?1
    ORDER BY cum.ord
  `).bind(unitId).all<MemberRow>();
  if (members.results.length === 0) throw new UnitTestError(409, "unit_has_no_members", "Curriculum unit has no testable members");

  const expected = decodeExpected(attempt.expected_answers);
  const expectedCounts = new Map<string, number>();
  for (const answer of expected) expectedCounts.set(answer.characterKey, (expectedCounts.get(answer.characterKey) ?? 0) + 1);
  const currentMembership = expected.length === members.results.length * 2
    && expectedCounts.size === members.results.length
    && members.results.every((member) => expectedCounts.get(member.key) === 2);
  if (!currentMembership) {
    await consumeAttempt(db, attempt, [], false, now);
    throw new UnitTestError(409, "unit_test_stale", "Curriculum unit membership changed; start a new test");
  }

  const forged = answers.length !== expected.length || answers.some((answer, index) =>
    answer.cardIndex !== index || answer.characterKey !== expected[index].characterKey,
  );
  if (forged) {
    await consumeAttempt(db, attempt, [], false, now);
    throw new UnitTestError(400, "unit_test_answers_mismatch", "Unit test answers do not match the issued challenge");
  }

  const correct = answers.filter((answer, index) => answer.selectedIndex === expected[index].answerIndex).length;
  const passed = correct === expected.length;
  await consumeAttempt(db, attempt, members.results, passed, now);
  return { passed, correct, total: answers.length, required: expected.length };
}
