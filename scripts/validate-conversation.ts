// JSON seed input is untyped at the filesystem boundary; this file validates it before use.
// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type, anti-slop/no-runtime-typeof, anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-conditional-empty-object-spread
import { readdir, readFile } from "node:fs/promises";
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
  if (sourceKind !== "authored" && sourceRef === undefined) throw new Error(`${path}.sourceRef: required unless sourceKind is authored`);
  const register = string(input.register, `${path}.register`);
  if (!CONVERSATION_REGISTERS.includes(register as SeedConversationChunk["register"])) throw new Error(`${path}.register: expected polite, casual, or keigo`);
  const role = string(input.role, `${path}.role`);
  if (!CONVERSATION_ROLES.includes(role as SeedConversationChunk["role"])) throw new Error(`${path}.role: expected say or hear`);
  const text = string(input.text, `${path}.text`);
  const audioKey = string(input.audioKey, `${path}.audioKey`);
  if (audioKey !== `c/${conversationAudioKey(text)}`) throw new Error(`${path}.audioKey: must match conversation audio key`);
  return {
    key: string(input.key, `${path}.key`), unitOrd: integer(input.unitOrd, `${path}.unitOrd`), ord: integer(input.ord, `${path}.ord`), text,
    kana: string(input.kana, `${path}.kana`), cueKo: string(input.cueKo, `${path}.cueKo`), register: register as SeedConversationChunk["register"],
    role: role as SeedConversationChunk["role"], sourceKind, ...(sourceRef === undefined ? {} : { sourceRef }), audioKey,
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
    if (existing && (existing.text !== item.text || existing.role !== item.role || existing.kana !== item.kana || existing.cueKo !== item.cueKo || existing.register !== item.register || existing.sourceKind !== item.sourceKind || existing.sourceRef !== item.sourceRef || existing.audioKey !== item.audioKey)) {
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
  }
  return { units, chunks, scenes };
}

async function main(): Promise<void> {
  const paths = process.argv.slice(2);
  const files = paths.length > 0
    ? paths
    : (await readdir("data/conversation")).filter((file) => file.endsWith(".json")).map((file) => join("data/conversation", file));
  if (files.length === 0) throw new Error("No conversation seed files found");
  await Promise.all(files.map(async (path) => parseConversationSeed(JSON.parse(await readFile(path, "utf8")) as unknown)));
  console.log(`Validated ${files.length} conversation seed file${files.length === 1 ? "" : "s"}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
