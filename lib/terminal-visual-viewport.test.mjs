import assert from "node:assert/strict";
import test from "node:test";
import { getTerminalVisibleHeight } from "./terminal-visual-viewport.ts";

test("terminal uses the visual viewport while a mobile keyboard is open", () => {
  assert.equal(getTerminalVisibleHeight(844, 490, 0, 64), 426);
  assert.equal(getTerminalVisibleHeight(844, 490, 52, 32), 510);
  assert.equal(getTerminalVisibleHeight(844, 844, 0, 64), null);
});
