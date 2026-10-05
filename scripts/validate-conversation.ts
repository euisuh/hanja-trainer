// JSON seed input is untyped at the filesystem boundary; this file validates it before use.
// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type, anti-slop/no-runtime-typeof, anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-conditional-empty-object-spread
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { conversationAudioKey } from "./generate-audio.ts";
import {
  CONVERSATION_REGISTERS,
  CONVERSATION_ROLES,
  type SeedConversationChunk,
  type SeedConversationDocument,
  type SeedConversationScene,
  type SeedConversationSceneTurn,
  type SeedConversationUnit,
} from "../shared/types.ts";

const TATOEBA_REF = /^Tatoeba #(\d+)$/u;
const EXCERPT_REF = /^Tatoeba #(\d+) \[(\d+)\/(\d+)\]$/u;
const JMDICT_REF = /^JMdict \d+$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
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
  const audioKey = string(input.audioKey, `${path}.audioKey`);
  if (audioKey !== `c/${conversationAudioKey(text)}`) throw new Error(`${path}.audioKey: must match conversation audio key`);
  return {
    key: string(input.key, `${path}.key`), unitOrd: integer(input.unitOrd, `${path}.unitOrd`), ord: integer(input.ord, `${path}.ord`), text,
    kana, cueKo: string(input.cueKo, `${path}.cueKo`), register: register as SeedConversationChunk["register"],
    role: role as SeedConversationChunk["role"], sourceKind: sourceKind as SeedConversationChunk["sourceKind"], ...(sourceRef === undefined ? {} : { sourceRef }), ...(ownerApproved === undefined ? {} : { ownerApproved }), audioKey,
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
  return { ord: integer(input.ord, `${path}.ord`), speaker, chunkOrds };
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
    if (existing && (existing.text !== item.text || existing.role !== item.role || existing.kana !== item.kana || existing.cueKo !== item.cueKo || existing.register !== item.register || existing.sourceKind !== item.sourceKind || existing.sourceRef !== item.sourceRef || existing.ownerApproved !== item.ownerApproved || existing.audioKey !== item.audioKey)) {
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
  return { units, chunks, scenes };
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
}

async function main(): Promise<void> {
  const verifyRemote = process.argv.includes("--verify-remote");
  const paths = process.argv.slice(2).filter((path) => path !== "--verify-remote");
  const files = paths.length > 0
    ? paths
    : (await readdir("data/conversation")).filter((file) => file.endsWith(".json")).map((file) => join("data/conversation", file));
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
