import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createGatewaySession,
  getGatewayToken,
  isGatewaySessionValid,
  matchesGatewayToken,
} from "./gateway-auth.ts";

test("creates one persistent gateway token and reports it once", () => {
  const root = mkdtempSync(join(tmpdir(), "pivot-ui-auth-"));
  const tokenPath = join(root, "config", "gateway-token");
  const logs = [];
  try {
    const first = getGatewayToken({ tokenPath, log: (message) => logs.push(message) });
    const second = getGatewayToken({ tokenPath, log: (message) => logs.push(message) });
    assert.match(first, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(second, first);
    assert.equal(readFileSync(tokenPath, "utf8"), `${first}\n`);
    assert.equal(logs.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepts only the configured token and signed unexpired sessions", () => {
  const root = mkdtempSync(join(tmpdir(), "pivot-ui-auth-"));
  const tokenPath = join(root, "gateway-token");
  try {
    writeFileSync(tokenPath, "configured-token\n");
    const options = { tokenPath };
    assert.equal(matchesGatewayToken("configured-token", options), true);
    assert.equal(matchesGatewayToken("wrong-token", options), false);
    const session = createGatewaySession(options);
    assert.equal(isGatewaySessionValid(session, options), true);
    assert.equal(isGatewaySessionValid(`${session}x`, options), false);
    assert.equal(isGatewaySessionValid("1.invalid", options), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
