import type { SessionCard, StartSessionRequest, StartSessionResponse } from "../../src/shared/api";
import type { CharacterEntry, TrackEntry } from "../../src/shared/types";
import { buildQueue, buildUnitTestQueue, meaningFor, readingFor, reviewKey } from "../../src/shared/buildQueue";
import { listByTrackLevel, listByUnit, listForTracks, listFreshForTracks, listPlacementMembersForTracks } from "../db/characters";
import { listStatesForTracks } from "../db/reviews";
import { listWordsForTracks } from "../db/words";
import { issueUnitTestAttempt, requireUnitTestTarget } from "./unitTest";
import { getCurriculumContent } from "./content";

const labels = {
  kr: { badge: "한국 · 한자", prompt: "훈음을 고르세요", meaningPrompt: "뜻을 고르세요" },
  jp: { badge: "日本 · 漢字", prompt: "音読みを選べ", meaningPrompt: "意味を選べ" },
  cn: { badge: "中国 · 汉字", prompt: "选择正确的拼音", meaningPrompt: "选择正确的意思" },
} as const;

const wordLabels = {
  kr: { badge: "한국 · 한자어", name: "한자어", prompt: "한자어 독음을 고르세요" },
  jp: { badge: "日本 · 熟語", name: "熟語", prompt: "熟語の読みを選べ" },
  cn: { badge: "中国 · 词语", name: "词语", prompt: "选择正确的词语读音" },
} as const;

export class ReviewTargetLocked extends Error {}

async function levelReviewKeys(db: D1Database, profileId: number, input: StartSessionRequest): Promise<string[]> {
  const track = input.tracks[0];
  const curriculum = await getCurriculumContent(db, profileId, track);
  const current = curriculum.units.findIndex((unit) => unit.current);
  const reviewable = (unit: (typeof curriculum.units)[number], index: number) => index < current || unit.nodes.every((node) => node.state === "done");
  const targets = curriculum.units.map((unit, index) => ({ unit, index })).filter(({ unit }) => input.unitId === undefined ? unit.levelOrd === input.levelOrd : unit.id === input.unitId);
  if (targets.length === 0 || targets.some(({ unit, index }) => !reviewable(unit, index))) throw new ReviewTargetLocked("This review target is not available yet");
  const entries = input.unitId === undefined ? await listByTrackLevel(db, track, input.levelOrd!) : await listByUnit(db, input.unitId);
  return entries.map((character) => reviewKey(character.id, track));
}

function promptFor(kind: SessionCard["kind"], track: keyof typeof labels): string {
  if (kind === "meaning") return labels[track].meaningPrompt;
  if (kind === "kun") return "訓読みを選べ";
  return labels[track].prompt;
}

function levelBadge(entry: TrackEntry): string {
  if (entry.track === "kr") return `한자 ${entry.level}`;
  if (entry.track === "jp") return entry.kanken === "未指定" ? entry.jlpt : `${entry.jlpt} · 漢検 ${entry.kanken}`;
  return `${entry.hsk} · ${entry.tier}`;
}

function hashSeed(value: string): number {
  let hash = 2_166_136_261;
  for (const point of value) hash = Math.imul(hash ^ point.codePointAt(0)!, 16_777_619);
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let value = seed || 1;
  return () => {
    value = Math.imul(value ^ value >>> 15, 1 | value);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296;
  };
}

function shuffleOptions(card: SessionCard, random: () => number): SessionCard {
  if (card.kind === "compare") return card;
  const correct = card.options[card.answerIndex];
  const options = [...card.options];
  for (let index = options.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [options[index], options[swap]] = [options[swap], options[index]];
  }
  return { ...card, options, answerIndex: options.indexOf(correct) };
}

function comparison(character: CharacterEntry): SessionCard["compare"] {
  return Object.fromEntries(character.tracks.map((entry) => [entry.track, {
    glyph: entry.glyph,
    reading: readingFor(entry).label,
    levelBadge: levelBadge(entry),
  }])) as SessionCard["compare"];
}

function toCard(item: ReturnType<typeof buildQueue>[number]): SessionCard {
  if (item.kind === "word") {
    const copy = wordLabels[item.track];
    return {
      kind: "word",
      characterKey: item.word.members[0].key,
      wordId: item.word.id,
      memberKeys: item.word.members.map((member) => member.key),
      meaningKo: copy.name,
      meaning: copy.name,
      reading: item.word.reading,
      track: item.track,
      glyph: item.word.glyph,
      levelBadge: `${copy.name} ${item.word.level}`,
      levelOrd: item.word.levelOrd,
      trackBadge: copy.badge,
      prompt: copy.prompt,
      sentence: null,
      options: item.options,
      answerIndex: item.answerIndex,
      wordSourceUrl: item.word.sourceUrl,
    };
  }
  const entry = item.character.tracks.find((candidate) => candidate.track === item.track)!;
  const sentence = item.character.sentences.find((candidate) => candidate.track === item.track);
  const base = {
    kind: item.kind,
    characterKey: item.character.key,
    meaningKo: item.character.meaningKo,
    meaning: meaningFor(item.character, item.track).label,
    reading: readingFor(entry).label,
    ...(entry.track === "jp" ? { kun: entry.kun } : {}),
    track: item.track,
    glyph: entry.glyph,
    levelBadge: levelBadge(entry),
    levelOrd: entry.levelOrd,
    trackBadge: labels[item.track].badge,
    prompt: item.kind === "compare" ? "한 글자, 세 소리" : promptFor(item.kind, item.track),
    sentence: sentence ? { text: sentence.text, reading: sentence.reading, translation: sentence.translationKo, source: sentence.source, targetIndex: sentence.targetIndex } : null,
  } as const;
  if (item.kind === "compare") return { ...base, kind: "compare", options: [], answerIndex: -1, compare: comparison(item.character) };
  return { ...base, kind: item.kind, options: item.options, answerIndex: item.answerIndex };
}

export async function startSession(db: D1Database, profileId: number, input: StartSessionRequest & { limit: number }, sessionId: string = crypto.randomUUID(), now = Date.now()): Promise<StartSessionResponse> {
  if (input.testOut === true) {
    const track = input.tracks[0];
    await requireUnitTestTarget(db, profileId, input.unitId!, track);
    const [targets, characters] = await Promise.all([listByUnit(db, input.unitId!), listForTracks(db, [track])]);
    const random = seededRandom(hashSeed(sessionId));
    const queue = buildUnitTestQueue({ targets, characters, track, random });
    const cards = queue.map(toCard);
    if (queue.length === targets.length * 2 && queue.length > 0) {
      await issueUnitTestAttempt(db, profileId, sessionId, input.unitId!, cards.map((card) => ({ characterKey: card.characterKey, answerIndex: card.answerIndex })), now);
    }
    return {
      sessionId,
      cards,
      ...(queue.length === targets.length * 2 && queue.length > 0 ? {} : {
        shortage: {
          code: "insufficient_content" as const,
          tracks: [track],
          message: `Not enough distinct ${track} readings to build a complete unit test`,
        },
      }),
    };
  }
  const [characters, states, candidateKeys, words] = await Promise.all([
    listForTracks(db, input.tracks),
    listStatesForTracks(db, profileId, input.tracks),
    input.mode === "lesson"
      ? listFreshForTracks(db, profileId, input.tracks, input).then((rows) => rows.map((row) => reviewKey(row.character_id, row.track)))
      : input.mode === "level-review"
        ? levelReviewKeys(db, profileId, input)
        : input.mode === "placement"
          ? listPlacementMembersForTracks(db, input.tracks).then((rows) => rows.map((row) => reviewKey(row.character_id, row.track)))
          : Promise.resolve([]),
    listWordsForTracks(db, input.tracks),
  ]);
  const stateMap = new Map(states.map((state) => [reviewKey(state.characterId, state.track), state]));
  const candidates = new Set(candidateKeys);
  const random = seededRandom(hashSeed(sessionId));
  const queue = buildQueue({ characters, enabledTracks: input.tracks, length: input.limit, mode: input.mode, reviewStates: stateMap, freshKeys: input.mode === "lesson" ? candidates : undefined, levelReviewKeys: input.mode === "level-review" ? candidates : undefined, placementKeys: input.mode === "placement" ? candidates : undefined, random, words });
  return {
    sessionId,
    cards: queue.map(toCard).map((card) => shuffleOptions(card, random)),
    ...(queue.length === 0 && input.mode !== "review" ? {
      shortage: {
        code: "insufficient_content" as const,
        tracks: input.tracks,
        message: `Not enough distinct ${input.tracks.join(", ")} readings to build four-option cards`,
      },
    } : {}),
  };
}
