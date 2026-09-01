import assert from "node:assert/strict";
import test from "node:test";
import { parsePort } from "./e2e-server.mjs";

test("E2E port validation rejects shell input and invalid ports", () => {
  assert.equal(parsePort("8787"), 8787);
  for (const value of ["", "0", "65536", "8787; touch injected"]) {
    assert.throws(() => parsePort(value), /E2E_PORT/u);
  }
});
