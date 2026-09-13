import { spawn, spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { joinSpokenReadings } from "../shared/spokenReading.ts";
import type { SeedDocument, SeedSentenceDocument, SeedTrackEntry, Track } from "../shared/types.ts";
import { parseSeed, parseSentenceSeed } from "./seed.ts";

type AudioEntry = { key: string; objectKey: string; text: string; track: Track };

export function cloudflareAccessHeaders(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const clientId = env.CF_ACCESS_CLIENT_ID?.trim();
  const clientSecret = env.CF_ACCESS_CLIENT_SECRET?.trim();
  if (Boolean(clientId) !== Boolean(clientSecret)) throw new Error("Set both CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET");
  return clientId ? { "CF-Access-Client-Id": clientId, "CF-Access-Client-Secret": clientSecret! } : {};
}

const voices: Record<Track, { languageCode: string; name: string }> = {
  kr: { languageCode: "ko-KR", name: "ko-KR-Neural2-A" },
  jp: { languageCode: "ja-JP", name: "ja-JP-Neural2-B" },
  cn: { languageCode: "cmn-CN", name: "cmn-CN-Wavenet-A" },
};

function reading(entry: SeedTrackEntry): string {
  if (entry.track === "kr") return entry.reading;
  if (entry.track === "jp") return joinSpokenReadings(entry.on, entry.kun);
  return entry.pinyin;
}

export function buildAudioEntries(documents: readonly SeedDocument[]): AudioEntry[] {
  const entries = new Map<string, AudioEntry>();
  for (const document of documents) {
    for (const character of document.characters) {
      for (const entry of character.tracks) {
        const objectKey = `${entry.track}/${character.key}.mp3`;
        const audio = { key: character.key, objectKey, text: reading(entry), track: entry.track };
        const existing = entries.get(objectKey);
        if (existing && existing.text !== audio.text) throw new Error(`${objectKey}: conflicting readings`);
        entries.set(objectKey, audio);
      }
    }
  }
  return [...entries.values()].sort((left, right) => left.objectKey < right.objectKey ? -1 : left.objectKey > right.objectKey ? 1 : 0);
}

export function buildSentenceAudioEntries(documents: readonly SeedSentenceDocument[]): AudioEntry[] {
  const entries = new Map<string, AudioEntry>();
  for (const document of documents) {
    for (const sentence of document.sentences) {
      if (sentence.track === "kr") continue;
      const id = /^Tatoeba #(\d+)$/u.exec(sentence.source)?.[1];
      if (!id) continue;
      const objectKey = `${sentence.track}/s${id}.mp3`;
      const audio = { key: sentence.text, objectKey, text: sentence.text, track: sentence.track };
      const existing = entries.get(objectKey);
      if (existing && existing.text !== audio.text) throw new Error(`${objectKey}: conflicting sentence text`);
      entries.set(objectKey, audio);
    }
  }
  return [...entries.values()].sort((left, right) => left.objectKey < right.objectKey ? -1 : left.objectKey > right.objectKey ? 1 : 0);
}

function commandOutput(command: string, args: string[]): string | null {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function accessToken(): string {
  const configured = process.env.GOOGLE_CLOUD_ACCESS_TOKEN?.trim();
  const token = configured || commandOutput("gcloud", ["auth", "application-default", "print-access-token"]);
  if (!token) throw new Error("Google auth missing: set GOOGLE_CLOUD_ACCESS_TOKEN or run gcloud auth application-default login");
  return token;
}

function quotaProject(): string | null {
  const configured = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (configured) return configured;
  const project = commandOutput("gcloud", ["config", "get-value", "project"]);
  return project && project !== "(unset)" ? project : null;
}

async function synthesize(entry: AudioEntry, token: string, project: string | null): Promise<Buffer> {
  const headers: Record<string, string> = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  if (project) headers["x-goog-user-project"] = project;
  const response = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
    method: "POST",
    headers,
    body: JSON.stringify({ input: { text: entry.text }, voice: voices[entry.track], audioConfig: { audioEncoding: "MP3" } }),
  });
  if (!response.ok) throw new Error(`${entry.objectKey}: Google TTS ${response.status} ${(await response.text()).slice(0, 1000)}`);
  const value: unknown = await response.json();
  if (typeof value !== "object" || value === null || !("audioContent" in value) || typeof value.audioContent !== "string") {
    throw new Error(`${entry.objectKey}: Google TTS returned no audioContent`);
  }
  return Buffer.from(value.audioContent, "base64");
}

async function upload(bucket: string, entry: AudioEntry, audio: Buffer, remote: boolean): Promise<void> {
  const wrangler = join("node_modules", ".bin", process.platform === "win32" ? "wrangler.cmd" : "wrangler");
  const args = ["r2", "object", "put", `${bucket}/${entry.objectKey}`, remote ? "--remote" : "--local", "--pipe", "--content-type", "audio/mpeg", "--cache-control", "public, max-age=86400"];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(wrangler, args, { stdio: ["pipe", "ignore", "pipe"] });
    let error = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { error += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${entry.objectKey}: Wrangler exited ${code}\n${error.trim()}`)));
    child.stdin.end(audio);
  });
}

async function forEachConcurrent<T>(values: readonly T[], concurrency: number, fn: (value: T) => Promise<void>): Promise<void> {
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (index < values.length) {
      const value = values[index];
      index += 1;
      await fn(value);
    }
  }));
}

async function missingRemote(entries: readonly AudioEntry[], baseUrl: string, concurrency: number): Promise<AudioEntry[]> {
  const missing: AudioEntry[] = [];
  const headers = cloudflareAccessHeaders();
  await forEachConcurrent(entries, concurrency, async (entry) => {
    const response = await fetch(`${baseUrl}/${entry.track}/${encodeURIComponent(entry.key)}.mp3`, { method: "HEAD", headers });
    if (response.status === 404) missing.push(entry);
    else if (!response.ok) throw new Error(`${entry.objectKey}: cache check returned ${response.status}`);
  });
  return missing.sort((left, right) => left.objectKey < right.objectKey ? -1 : left.objectKey > right.objectKey ? 1 : 0);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("Usage: npm run audio:generate -- [--dry-run] [--force] [--local|--remote]\nAuth: GOOGLE_CLOUD_ACCESS_TOKEN or gcloud ADC; optional GOOGLE_CLOUD_PROJECT and CF_ACCESS_CLIENT_ID/CF_ACCESS_CLIENT_SECRET");
    return;
  }
  const known = new Set(["--dry-run", "--force", "--local", "--remote"]);
  const unknown = args.find((arg) => arg.startsWith("--") && !known.has(arg));
  if (unknown) throw new Error(`Unknown option: ${unknown}`);
  if (args.includes("--local") && args.includes("--remote")) throw new Error("Choose --local or --remote");
  const remote = !args.includes("--local");
  const files = args.filter((arg) => !arg.startsWith("--"));
  const paths = files.length > 0 ? files : (await readdir("data/characters")).filter((file) => file.endsWith(".json")).map((file) => join("data/characters", file));
  const documents = await Promise.all(paths.map(async (path) => parseSeed(JSON.parse(await readFile(path, "utf8")) as unknown)));
  const sentencePaths = (await readdir("data/sentences")).filter((file) => file.endsWith(".json")).map((file) => join("data/sentences", file));
  const sentenceDocuments = await Promise.all(sentencePaths.map(async (path) => parseSentenceSeed(JSON.parse(await readFile(path, "utf8")) as unknown)));
  const entries = [...buildAudioEntries(documents), ...buildSentenceAudioEntries(sentenceDocuments)];
  if (args.includes("--dry-run")) { console.log(`${entries.length} unique clips from ${paths.length} files`); return; }
  const concurrency = Number(process.env.AUDIO_CONCURRENCY ?? 4);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 20) throw new Error("AUDIO_CONCURRENCY must be an integer from 1 to 20");
  const baseUrl = (process.env.AUDIO_BASE_URL ?? "https://hanja.uiseoya.com/api/audio").replace(/\/$/u, "");
  const pending = remote && !args.includes("--force") ? await missingRemote(entries, baseUrl, concurrency) : entries;
  if (pending.length === 0) { console.log(`${entries.length} clips already cached`); return; }
  const token = accessToken();
  const project = quotaProject();
  const bucket = process.env.AUDIO_R2_BUCKET ?? "hanja-audio";
  let completed = 0;
  await forEachConcurrent(pending, concurrency, async (entry) => {
    await upload(bucket, entry, await synthesize(entry, token, project), remote);
    completed += 1;
    if (completed % 25 === 0 || completed === pending.length) console.log(`${completed}/${pending.length} uploaded`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
