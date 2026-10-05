import assert from "node:assert/strict";
import test from "node:test";
import type { SeedSentenceDocument, SeedSentenceEntry } from "../shared/types.ts";
import { buildConversationAudioEntries, buildSentenceAudioEntries, cloudflareAccessHeaders, conversationAudioKey, missingRemote } from "./generate-audio.ts";

test("builds Cloudflare Access service-token headers", () => {
  assert.deepEqual(cloudflareAccessHeaders({ CF_ACCESS_CLIENT_ID: "id", CF_ACCESS_CLIENT_SECRET: "secret" }), {
    "CF-Access-Client-Id": "id",
    "CF-Access-Client-Secret": "secret",
  });
  assert.deepEqual(cloudflareAccessHeaders({}), {});
  assert.throws(() => cloudflareAccessHeaders({ CF_ACCESS_CLIENT_ID: "id" }), /Set both/);
});

function sentence(overrides: Partial<SeedSentenceEntry>): SeedSentenceEntry {
  return {
    characterKey: "愛", track: "cn", text: "我爱您。", reading: "wǒ ài nín。",
    translationKo: "사랑해요.", source: "Tatoeba #380195", sourceKind: "corpus", targetIndex: 1, rank: 0,
    ...overrides,
  };
}

test("builds one sentence clip per unique Tatoeba id and skips Korean", () => {
  const documents: SeedSentenceDocument[] = [
    { sentences: [sentence({}), sentence({ characterKey: "工", track: "jp", text: "工場で働いています。", reading: "こうじょうではたらいています。", source: "Tatoeba #10098195", rank: 1 })] },
    { sentences: [sentence({ characterKey: "校", track: "kr", text: "학교에 갑니다.", reading: null, source: "국립국어원", rank: 2 })] },
  ];
  const entries = buildSentenceAudioEntries(documents);
  assert.deepEqual(entries, [
    { key: "我爱您。", objectKey: "cn/s380195.mp3", text: "我爱您。", track: "cn" },
    { key: "工場で働いています。", objectKey: "jp/s10098195.mp3", text: "工場で働いています。", track: "jp" },
  ]);
});

test("dedupes repeated Tatoeba ids and rejects conflicting text for the same id", () => {
  const same = [sentence({}), sentence({ characterKey: "我", rank: 1 })];
  assert.equal(buildSentenceAudioEntries([{ sentences: same }]).length, 1);
  const conflicting = [sentence({}), sentence({ text: "different text.", rank: 1 })];
  assert.throws(() => buildSentenceAudioEntries([{ sentences: conflicting }]), /conflicting sentence text/);
});

test("skips sentences whose source is not a Tatoeba reference", () => {
  const entries = buildSentenceAudioEntries([{ sentences: [sentence({ source: "한국어문회 예문" })] }]);
  assert.deepEqual(entries, []);
});

test("builds stable hashed conversation keys per text, voice, and speed", () => {
  const key = conversationAudioKey("もう一度お願いします。", "ja-JP-Neural2-B");
  assert.match(key, /^[0-9a-f]{16}$/u);
  assert.equal(conversationAudioKey("もう一度お願いします。", "ja-JP-Neural2-B"), key);
  assert.notEqual(conversationAudioKey("もう一度お願いします。", "ja-JP-Neural2-C"), key);
  assert.equal(buildConversationAudioEntries([
    { text: "もう一度お願いします。", voice: "ja-JP-Neural2-B" },
    { text: "もう一度お願いします。", voice: "ja-JP-Neural2-B" },
  ]).length, 1);
});

test("checks only missing conversation clips", async () => {
  const entries = buildConversationAudioEntries([
    { text: "もう一度お願いします。" },
    { text: "ゆっくりお願いします。" },
  ]);
  const seen: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    seen.push(String(input));
    return new Response(null, { status: seen.length === 1 ? 200 : 404 });
  };
  try {
    const missing = await missingRemote(entries, "https://example.com/api/audio", 1);
    assert.deepEqual(missing, [entries[1]]);
    assert.ok(seen.every((url) => /\/jp\/c\/[0-9a-f]{16}\.mp3$/u.test(url)));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
