import assert from "node:assert/strict";
import test from "node:test";
import { networkLost, proxyWorkerFailure, retryableWranglerCrash, wranglerFatalPrompt } from "./e2e-ci.mjs";

test("CI retries only confirmed Wrangler runtime crashes", () => {
  assert.equal(retryableWranglerCrash(wranglerFatalPrompt, `${proxyWorkerFailure}\n${networkLost}`), true);
  assert.equal(retryableWranglerCrash("kj/async-io-unix.c++:186: disconnected: Broken pipe"), false);
  assert.equal(retryableWranglerCrash(wranglerFatalPrompt), false);
  assert.equal(retryableWranglerCrash(wranglerFatalPrompt, proxyWorkerFailure), false);
  assert.equal(retryableWranglerCrash("", `${proxyWorkerFailure}\n${networkLost}`), false);
  assert.equal(retryableWranglerCrash("connect ECONNREFUSED 127.0.0.1:8787"), false);
  assert.equal(retryableWranglerCrash("Error: write EPIPE"), false);
});
