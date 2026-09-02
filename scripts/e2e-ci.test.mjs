import assert from "node:assert/strict";
import test from "node:test";
import { brokenPipeSignature, retryableWranglerCrash } from "./e2e-ci.mjs";

test("CI retries only the confirmed native Wrangler broken pipe", () => {
  assert.equal(retryableWranglerCrash(`prefix ${brokenPipeSignature} suffix`), true);
  assert.equal(retryableWranglerCrash("connect ECONNREFUSED 127.0.0.1:8787"), false);
  assert.equal(retryableWranglerCrash("Error: write EPIPE"), false);
});
