import assert from "node:assert/strict";
import test from "node:test";
import { applyTerminalModifier } from "./terminal-mobile-input.ts";

test("sticky terminal modifiers encode the next terminal input", () => {
  assert.equal(applyTerminalModifier("ctrl", "b"), "\x02");
  assert.equal(applyTerminalModifier("ctrl", "bd"), "\x02d");
  assert.equal(applyTerminalModifier("ctrl", "?"), "\x7f");
  assert.equal(applyTerminalModifier("alt", "f"), "\x1bf");
  assert.equal(applyTerminalModifier("ctrl", "中文"), "中文");
  assert.equal(applyTerminalModifier("ctrl", "ß"), "ß");
});
