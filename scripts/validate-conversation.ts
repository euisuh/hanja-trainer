// JSON seed input is untyped at the filesystem boundary; this file validates it before use.
// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type, anti-slop/no-runtime-typeof, anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-conditional-empty-object-spread
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { conversationAudioKey } from "./generate-audio.ts";
import { SLOT_BLANK, SLOT_CUE_MARKER } from "../shared/slotDrill.ts";
import {
  CONVERSATION_AUTHORED_SCOPES,
  CONVERSATION_REGISTERS,
  CONVERSATION_ROLES,
  type ConversationAuthoredScope,
  type SeedConversationChunk,
  type SeedConversationDocument,
  type SeedConversationScene,
  type SeedConversationSceneTurn,
  type SeedConversationTemplate,
  type SeedConversationTurnVariant,
  type SeedConversationUnit,
} from "../shared/types.ts";

const TATOEBA_REF = /^Tatoeba #(\d+)$/u;
const EXCERPT_REF = /^Tatoeba #(\d+) \[(\d+)\/(\d+)\]$/u;
const JMDICT_REF = /^JMdict \d+$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const NOTE_KO_MAX = 80;
const DEPENDENT_CUE = /^같은 (말|확인|동의)/u;
// Authored rows overall (all scopes, deduped by key) and authored npc lines per unit. See docs/talk-mode.md.
export const AUTHORED_SHARE_CAP = 0.25;
export const AUTHORED_NPC_UNIT_CAP = 0.5;
const KANA = /^(?:[\p{Script=Hiragana}\p{Script=Katakana}ー]|\p{Punctuation}|\s)+$/u;

export interface VerifiedTatoebaSentence {
  text: string;
  sourceAuthor: string;
}

export type TatoebaFetcher = (id: string) => Promise<VerifiedTatoebaSentence>;

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${path}: expected object`);
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path}: expected array`);
  return value;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${path}: expected non-empty string`);
  return value;
}

function integer(value: unknown, path: string, min = 1): number {
  if (!Number.isInteger(value) || (value as number) < min) throw new Error(`${path}: expected integer >= ${min}`);
  return value as number;
}

function unique(values: number[], path: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${path}: duplicate ord`);
}

function unit(value: unknown, index: number): SeedConversationUnit {
  const path = `units[${index}]`;
  const input = record(value, path);
  return { ord: integer(input.ord, `${path}.ord`), titleKo: string(input.titleKo, `${path}.titleKo`), goalKo: string(input.goalKo, `${path}.goalKo`) };
}

function chunk(value: unknown, index: number): SeedConversationChunk {
  const path = `chunks[${index}]`;
  const input = record(value, path);
  const sourceKind = string(input.sourceKind, `${path}.sourceKind`);
  const sourceRef = input.sourceRef === undefined ? undefined : string(input.sourceRef, `${path}.sourceRef`);
  const ownerApproved = input.ownerApproved === undefined ? undefined : string(input.ownerApproved, `${path}.ownerApproved`);
  if (sourceKind === "authored") {
    if (ownerApproved === undefined || !DATE.test(ownerApproved)) throw new Error(`${path}.ownerApproved: authored content requires YYYY-MM-DD approval`);
    if (input.reviewNote === undefined) throw new Error(`${path}.reviewNote: authored content requires a review note`);
    if (!CONVERSATION_AUTHORED_SCOPES.includes(input.authoredScope as ConversationAuthoredScope)) throw new Error(`${path}.authoredScope: expected npc or spoken`);
  } else if (sourceKind !== "corpus" && sourceKind !== "excerpt" && sourceKind !== "jmdict") {
    throw new Error(`${path}.sourceKind: expected corpus, excerpt, jmdict, or owner-approved authored`);
  } else if (sourceRef === undefined) {
    throw new Error(`${path}.sourceRef: required`);
  } else if ((sourceKind === "corpus" && !TATOEBA_REF.test(sourceRef))
    || (sourceKind === "excerpt" && !EXCERPT_REF.test(sourceRef))
    || (sourceKind === "jmdict" && !JMDICT_REF.test(sourceRef))) {
    throw new Error(`${path}.sourceRef: invalid ${sourceKind} reference`);
  }
  const register = string(input.register, `${path}.register`);
  if (!CONVERSATION_REGISTERS.includes(register as SeedConversationChunk["register"])) throw new Error(`${path}.register: expected polite, casual, or keigo`);
  const role = string(input.role, `${path}.role`);
  if (!CONVERSATION_ROLES.includes(role as SeedConversationChunk["role"])) throw new Error(`${path}.role: expected say or hear`);
  const text = string(input.text, `${path}.text`);
  const kana = string(input.kana, `${path}.kana`);
  if (!KANA.test(kana)) throw new Error(`${path}.kana: expected kana and punctuation`);
  const reviewNote = input.reviewNote === undefined ? undefined : string(input.reviewNote, `${path}.reviewNote`);
  const authoredScope = sourceKind === "authored" ? input.authoredScope as ConversationAuthoredScope : undefined;
  if (authoredScope === "npc" && input.role !== "hear") throw new Error(`${path}.authoredScope: npc lines must be hear chunks`);
  const noteKo = input.noteKo === undefined ? undefined : string(input.noteKo, `${path}.noteKo`);
  if (noteKo !== undefined && [...noteKo].length > NOTE_KO_MAX) throw new Error(`${path}.noteKo: at most ${NOTE_KO_MAX} characters`);
  const cueKo = string(input.cueKo, `${path}.cueKo`);
  if (DEPENDENT_CUE.test(cueKo)) throw new Error(`${path}.cueKo: must stand alone, not refer to a previous card ("같은 말…")`);
  const audioKey = string(input.audioKey, `${path}.audioKey`);
  if (audioKey !== `c/${conversationAudioKey(text)}`) throw new Error(`${path}.audioKey: must match conversation audio key`);
  return {
    key: string(input.key, `${path}.key`), unitOrd: integer(input.unitOrd, `${path}.unitOrd`), ord: integer(input.ord, `${path}.ord`), text,
    kana, cueKo, register: register as SeedConversationChunk["register"],
    role: role as SeedConversationChunk["role"], sourceKind: sourceKind as SeedConversationChunk["sourceKind"], ...(sourceRef === undefined ? {} : { sourceRef }), ...(ownerApproved === undefined ? {} : { ownerApproved }), ...(authoredScope === undefined ? {} : { authoredScope }), ...(reviewNote === undefined ? {} : { reviewNote }), ...(noteKo === undefined ? {} : { noteKo }), audioKey,
  };
}

function template(value: unknown, index: number): SeedConversationTemplate {
  const path = `templates[${index}]`;
  const input = record(value, path);
  const ownerApproved = string(input.ownerApproved, `${path}.ownerApproved`);
  if (!DATE.test(ownerApproved)) throw new Error(`${path}.ownerApproved: expected YYYY-MM-DD`);
  const jaTemplate = string(input.jaTemplate, `${path}.jaTemplate`);
  const kanaTemplate = string(input.kanaTemplate, `${path}.kanaTemplate`);
  const cueKo = string(input.cueKo, `${path}.cueKo`);
  for (const [name, text] of [["jaTemplate", jaTemplate], ["kanaTemplate", kanaTemplate]]) {
    if (text.split(SLOT_BLANK).length !== 2) throw new Error(`${path}.${name}: expected exactly one ${SLOT_BLANK}`);
  }
  if (!KANA.test(kanaTemplate)) throw new Error(`${path}.kanaTemplate: expected kana and punctuation`);
  if (!cueKo.includes(SLOT_CUE_MARKER)) throw new Error(`${path}.cueKo: expected ${SLOT_CUE_MARKER}`);
  const register = string(input.register, `${path}.register`);
  if (!CONVERSATION_REGISTERS.includes(register as SeedConversationChunk["register"])) throw new Error(`${path}.register: expected polite, casual, or keigo`);
  const slots = array(input.slots, `${path}.slots`).map((item, slotIndex) => {
    const slot = record(item, `${path}.slots[${slotIndex}]`);
    const kana = string(slot.kana, `${path}.slots[${slotIndex}].kana`);
    if (!KANA.test(kana)) throw new Error(`${path}.slots[${slotIndex}].kana: expected kana and punctuation`);
    return { ja: string(slot.ja, `${path}.slots[${slotIndex}].ja`), kana, meaningKo: string(slot.meaningKo, `${path}.slots[${slotIndex}].meaningKo`) };
  });
  if (slots.length < 4 || slots.length > 6) throw new Error(`${path}.slots: expected 4 to 6 slots`);
  if (new Set(slots.map((slot) => slot.ja)).size !== slots.length) throw new Error(`${path}.slots: duplicate slot`);
  return {
    key: string(input.key, `${path}.key`), unitOrd: integer(input.unitOrd, `${path}.unitOrd`), ord: integer(input.ord, `${path}.ord`),
    jaTemplate, kanaTemplate, cueKo, register: register as SeedConversationChunk["register"],
    patternChunkKey: string(input.patternChunkKey, `${path}.patternChunkKey`), ownerApproved, reviewNote: string(input.reviewNote, `${path}.reviewNote`), slots,
  };
}

function turn(value: unknown, sceneIndex: number, index: number): SeedConversationSceneTurn {
  const path = `scenes[${sceneIndex}].turns[${index}]`;
  const input = record(value, path);
  const speaker = string(input.speaker, `${path}.speaker`);
  if (speaker !== "npc" && speaker !== "learner") throw new Error(`${path}.speaker: expected npc or learner`);
  const chunkOrds = array(input.chunkOrds, `${path}.chunkOrds`).map((ord, chunkIndex) => integer(ord, `${path}.chunkOrds[${chunkIndex}]`));
  if (chunkOrds.length === 0) throw new Error(`${path}.chunkOrds: expected at least one target`);
  unique(chunkOrds, `${path}.chunkOrds`);
  let variants: SeedConversationTurnVariant[] | undefined;
  if (input.variants !== undefined) {
    if (speaker !== "npc") throw new Error(`${path}.variants: only npc turns have variants`);
    variants = array(input.variants, `${path}.variants`).map((item, variantIndex) => {
      const variant = record(item, `${path}.variants[${variantIndex}]`);
      return { chunkOrd: integer(variant.chunkOrd, `${path}.variants[${variantIndex}].chunkOrd`), replyOrd: integer(variant.replyOrd, `${path}.variants[${variantIndex}].replyOrd`) };
    });
    if (variants.length < 2 || variants.length > 3) throw new Error(`${path}.variants: expected 2 or 3 variants`);
    unique(variants.map((variant) => variant.chunkOrd), `${path}.variants`);
    if (variants.length !== chunkOrds.length || !variants.every((variant) => chunkOrds.includes(variant.chunkOrd))) throw new Error(`${path}.variants: chunkOrds must list exactly the variant chunks`);
  }
  return { ord: integer(input.ord, `${path}.ord`), speaker, chunkOrds, ...(variants === undefined ? {} : { variants }) };
}

function scene(value: unknown, index: number): SeedConversationScene {
  const path = `scenes[${index}]`;
  const input = record(value, path);
  const turns = array(input.turns, `${path}.turns`).map((item, turnIndex) => turn(item, index, turnIndex));
  if (turns.length === 0) throw new Error(`${path}: dead-end scene has no turns`);
  unique(turns.map((item) => item.ord), `${path}.turns`);
  return {
    unitOrd: integer(input.unitOrd, `${path}.unitOrd`), ord: integer(input.ord, `${path}.ord`), titleKo: string(input.titleKo, `${path}.titleKo`),
    settingKo: string(input.settingKo, `${path}.settingKo`), goalKo: string(input.goalKo, `${path}.goalKo`), turns,
  };
}

export function parseConversationSeed(value: unknown): SeedConversationDocument {
  const input = record(value, "conversation");
  const units = array(input.units, "conversation.units").map(unit);
  const chunks = array(input.chunks, "conversation.chunks").map(chunk);
  const scenes = array(input.scenes, "conversation.scenes").map(scene);
  const templates = input.templates === undefined ? undefined : array(input.templates, "conversation.templates").map(template);
  unique(units.map((item) => item.ord), "conversation.units");
  const unitOrds = new Set(units.map((item) => item.ord));
  for (const item of chunks) if (!unitOrds.has(item.unitOrd)) throw new Error(`chunks[${chunks.indexOf(item)}].unitOrd: unknown unit ${item.unitOrd}`);
  for (const item of scenes) if (!unitOrds.has(item.unitOrd)) throw new Error(`scenes[${scenes.indexOf(item)}].unitOrd: unknown unit ${item.unitOrd}`);
  const chunkKeys = chunks.map((item) => `${item.unitOrd}:${item.ord}`);
  if (new Set(chunkKeys).size !== chunkKeys.length) throw new Error("conversation.chunks: duplicate unitOrd and ord");
  const keys = new Map<string, SeedConversationChunk>();
  const identities = new Map<string, string>();
  for (const item of chunks) {
    const existing = keys.get(item.key);
    if (existing && (existing.text !== item.text || existing.role !== item.role || existing.kana !== item.kana || existing.cueKo !== item.cueKo || existing.register !== item.register || existing.sourceKind !== item.sourceKind || existing.sourceRef !== item.sourceRef || existing.ownerApproved !== item.ownerApproved || existing.authoredScope !== item.authoredScope || existing.reviewNote !== item.reviewNote || existing.noteKo !== item.noteKo || existing.audioKey !== item.audioKey)) {
      throw new Error(`conversation.chunks: inconsistent key ${item.key}`);
    }
    keys.set(item.key, item);
    const identity = `${item.text}:${item.role}`;
    const key = identities.get(identity);
    if (key !== undefined && key !== item.key) throw new Error(`conversation.chunks: duplicate text and role uses ${key} and ${item.key}`);
    identities.set(identity, item.key);
  }
  const sceneKeys = scenes.map((item) => `${item.unitOrd}:${item.ord}`);
  if (new Set(sceneKeys).size !== sceneKeys.length) throw new Error("conversation.scenes: duplicate unitOrd and ord");
  const knownChunks = new Set(chunkKeys);
  for (const item of scenes) for (const itemTurn of item.turns) for (const chunkOrd of itemTurn.chunkOrds) {
    if (!knownChunks.has(`${item.unitOrd}:${chunkOrd}`)) throw new Error(`scene ${item.unitOrd}:${item.ord} turn ${itemTurn.ord}: missing target chunk ${chunkOrd}`);
    const target = chunks.find((chunk) => chunk.unitOrd === item.unitOrd && chunk.ord === chunkOrd);
    const expectedRole = itemTurn.speaker === "learner" ? "say" : "hear";
    if (target?.role !== expectedRole) throw new Error(`scene ${item.unitOrd}:${item.ord} turn ${itemTurn.ord}: ${itemTurn.speaker} must reference ${expectedRole} chunks`);
  }
  if (templates !== undefined) {
    const templateKeys = templates.map((item) => `${item.unitOrd}:${item.ord}`);
    if (new Set(templateKeys).size !== templateKeys.length || new Set(templates.map((item) => item.key)).size !== templates.length) throw new Error("conversation.templates: duplicate key or unitOrd and ord");
    for (const item of templates) {
      if (!unitOrds.has(item.unitOrd)) throw new Error(`template ${item.key}: unknown unit ${item.unitOrd}`);
      if (!chunks.some((candidate) => candidate.key === item.patternChunkKey && candidate.unitOrd === item.unitOrd && candidate.role === "say")) throw new Error(`template ${item.key}: patternChunkKey ${item.patternChunkKey} must be a say chunk in unit ${item.unitOrd}`);
    }
  }
  for (const item of scenes) item.turns.forEach((itemTurn, index) => {
    if (itemTurn.variants === undefined) return;
    const reply = item.turns[index + 1];
    if (reply?.speaker !== "learner") throw new Error(`scene ${item.unitOrd}:${item.ord} turn ${itemTurn.ord}: variants need a learner turn right after`);
    for (const variant of itemTurn.variants) {
      if (!reply.chunkOrds.includes(variant.replyOrd)) throw new Error(`scene ${item.unitOrd}:${item.ord} turn ${itemTurn.ord}: reply ${variant.replyOrd} is not a target of turn ${reply.ord}`);
    }
  });
  return { units, chunks, scenes, ...(templates === undefined ? {} : { templates }) };
}

function tatoebaId(sourceRef: string): string | undefined {
  return TATOEBA_REF.exec(sourceRef)?.[1] ?? EXCERPT_REF.exec(sourceRef)?.[1];
}

function excerpt(sourceRef: string): { index: number; total: number } | undefined {
  const match = EXCERPT_REF.exec(sourceRef);
  return match === null ? undefined : { index: Number(match[2]), total: Number(match[3]) };
}

function owner(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") return value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  for (const key of ["username", "name", "login"]) {
    const candidate = input[key];
    if (typeof candidate === "string" && candidate.trim() !== "") return candidate;
  }
  return undefined;
}

function tatoebaSentence(value: unknown): VerifiedTatoebaSentence {
  const root = record(value, "Tatoeba response");
  const candidate = Array.isArray(root.data) ? root.data[0] : root.data ?? root;
  const input = record(candidate, "Tatoeba sentence");
  const text = string(input.text, "Tatoeba sentence.text");
  const sourceAuthor = owner(input.owner) ?? owner(input.user);
  if (sourceAuthor === undefined) throw new Error("Tatoeba sentence.owner: expected owner");
  return { text, sourceAuthor };
}

export async function fetchTatoebaSentence(id: string): Promise<VerifiedTatoebaSentence> {
  const response = await fetch(`https://api.tatoeba.org/unstable/sentences/${id}`);
  if (!response.ok) throw new Error(`Tatoeba #${id}: ${response.status} ${response.statusText}`);
  return tatoebaSentence(await response.json() as unknown);
}

export async function verifyConversationDocuments(
  documents: SeedConversationDocument[],
  fetcher: TatoebaFetcher = fetchTatoebaSentence,
  cachePath = "data/conversation/.verified.json",
): Promise<void> {
  let cache: Record<string, VerifiedTatoebaSentence> = {};
  try {
    cache = record(JSON.parse(await readFile(cachePath, "utf8")) as unknown, cachePath) as Record<string, VerifiedTatoebaSentence>;
  } catch (error: unknown) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  for (const document of documents) for (const chunk of document.chunks) {
    if (chunk.sourceRef === undefined) continue;
    const id = tatoebaId(chunk.sourceRef);
    if (id === undefined) continue;
    const verified = cache[id] ?? await fetcher(id);
    const span = excerpt(chunk.sourceRef);
    if (span === undefined) {
      if (verified.text !== chunk.text) throw new Error(`${chunk.sourceRef}: text does not match ${chunk.key}`);
    } else {
      const spans = [...verified.text.matchAll(/「([^「」]+)」/gu)].map((match) => match[1]);
      if (span.index < 1 || span.index > spans.length || span.total !== spans.length || spans[span.index - 1] !== chunk.text) {
        throw new Error(`${chunk.sourceRef}: excerpt must be an exact 「」 segment`);
      }
    }
    cache[id] = verified;
  }
  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
}

export function validateConversationDocuments(documents: SeedConversationDocument[]): void {
  const ords = documents.flatMap((document) => document.units.map((unit) => unit.ord));
  if (new Set(ords).size !== ords.length) throw new Error("conversation.units: duplicate ord across files");
  const unique = new Map<string, SeedConversationChunk>();
  const identities = new Map<string, string>();
  for (const document of documents) for (const chunk of document.chunks) {
    unique.set(chunk.key, chunk);
    const identity = `${chunk.text}:${chunk.role}`;
    const other = identities.get(identity);
    if (other !== undefined && other !== chunk.key) throw new Error(`conversation.chunks: duplicate text and role across files uses ${other} and ${chunk.key}`);
    identities.set(identity, chunk.key);
  }
  const authoredChunks = [...unique.values()].filter((chunk) => chunk.sourceKind === "authored");
  if (authoredChunks.length > unique.size * AUTHORED_SHARE_CAP) {
    throw new Error(`conversation: authored share ${authoredChunks.length}/${unique.size} exceeds ${AUTHORED_SHARE_CAP * 100}%`);
  }
  for (const document of documents) for (const unit of document.units) {
    const npc = new Set(document.chunks.filter((chunk) => chunk.unitOrd === unit.ord && chunk.authoredScope === "npc").map((chunk) => chunk.key));
    const total = document.chunks.filter((chunk) => chunk.unitOrd === unit.ord).length;
    if (npc.size > total * AUTHORED_NPC_UNIT_CAP) throw new Error(`unit ${unit.ord}: authored npc lines ${npc.size}/${total} exceed ${AUTHORED_NPC_UNIT_CAP * 100}%`);
  }
}

async function main(): Promise<void> {
  const verifyRemote = process.argv.includes("--verify-remote");
  const paths = process.argv.slice(2).filter((path) => path !== "--verify-remote");
  const files = paths.length > 0
    ? paths
    : (await readdir("data/conversation")).filter((file) => file.startsWith("unit-") && file.endsWith(".json")).map((file) => join("data/conversation", file));
  if (files.length === 0) throw new Error("No conversation seed files found");
  const documents = await Promise.all(files.map(async (path) => parseConversationSeed(JSON.parse(await readFile(path, "utf8")) as unknown)));
  validateConversationDocuments(documents);
  if (verifyRemote) await verifyConversationDocuments(documents);
  console.log(`Validated ${files.length} conversation seed file${files.length === 1 ? "" : "s"}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
