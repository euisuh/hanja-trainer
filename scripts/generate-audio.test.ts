import assert from "node:assert/strict";
import test from "node:test";
import { cloudflareAccessHeaders } from "./generate-audio.ts";

test("builds Cloudflare Access service-token headers", () => {
  assert.deepEqual(cloudflareAccessHeaders({ CF_ACCESS_CLIENT_ID: "id", CF_ACCESS_CLIENT_SECRET: "secret" }), {
    "CF-Access-Client-Id": "id",
    "CF-Access-Client-Secret": "secret",
  });
  assert.deepEqual(cloudflareAccessHeaders({}), {});
  assert.throws(() => cloudflareAccessHeaders({ CF_ACCESS_CLIENT_ID: "id" }), /Set both/);
});
