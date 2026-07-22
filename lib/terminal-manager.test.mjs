import assert from "node:assert/strict";
import test from "node:test";

test("terminal sizes and output are bounded for untrusted browser input", async () => {
  const { appendTerminalOutput, MAX_OUTPUT_CHARS, MAX_OUTPUT_LINES, normalizeTerminalSize } = await import("./terminal-manager.ts");
  assert.deepEqual(normalizeTerminalSize(999, 1), { cols: 400, rows: 6 });
  assert.deepEqual(normalizeTerminalSize("bad", undefined), { cols: 80, rows: 24 });
  assert.equal(appendTerminalOutput("a".repeat(MAX_OUTPUT_CHARS), "tail").endsWith("tail"), true);
  assert.equal(appendTerminalOutput("", Array.from({ length: MAX_OUTPUT_LINES + 5 }, (_, index) => `line-${index}`).join("\n")).split("\n").length, MAX_OUTPUT_LINES);
});

test("terminal creation recycles the oldest session at the global cap", { skip: process.platform === "win32" }, async (t) => {
  const { MAX_TERMINAL_SESSIONS, startTerminal } = await import("./terminal-manager.ts");
  const previousSessions = globalThis.__piTerminalSessions;
  globalThis.__piTerminalSessions = new Map();
  const oldestId = "tool:terminal:oldestterminal123";
  const newestId = "tool:terminal:newestterminal123";
  startTerminal(oldestId, process.cwd(), process.cwd(), "Oldest");
  for (let index = 1; index < MAX_TERMINAL_SESSIONS; index += 1) globalThis.__piTerminalSessions.set(`existing-${index}`, {});
  t.after(() => {
    const newest = globalThis.__piTerminalSessions?.get(newestId);
    if (newest) newest.pty.kill();
    if (previousSessions) globalThis.__piTerminalSessions = previousSessions;
    else delete globalThis.__piTerminalSessions;
  });
  assert.ok(startTerminal(newestId, process.cwd(), process.cwd(), "Newest"));
  assert.equal(globalThis.__piTerminalSessions.has(oldestId), false);
});

test("a terminal survives a detached viewer until its tab is explicitly closed", { skip: process.platform === "win32" }, async (t) => {
  const { closeTerminal, listTerminals, startTerminal, subscribeTerminal, writeTerminal } = await import("./terminal-manager.ts");
  const id = "tool:terminal:integration123";
  t.after(() => closeTerminal(id));
  startTerminal(id, process.cwd(), process.cwd(), "Integration terminal", 80, 24);
  const output = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("terminal did not return command output")), 2_000);
    const unsubscribe = subscribeTerminal(id, (event) => {
      if (event.type === "data" && event.data.includes("terminal-manager-live")) {
        clearTimeout(timeout);
        unsubscribe();
        resolve(event.data);
      }
    });
    assert.ok(unsubscribe);
    assert.equal(writeTerminal(id, "printf terminal-manager-live\\r"), "ok");
  });
  assert.match(output, /terminal-manager-live/);
  assert.equal(listTerminals(process.cwd()).some((terminal) => terminal.id === id && terminal.running), true);
  assert.equal(closeTerminal(id), true);
  assert.equal(listTerminals(process.cwd()).some((terminal) => terminal.id === id), false);
});

test("terminal command history keeps the fifty most recent completed commands", { skip: process.platform === "win32" }, async (t) => {
  const { closeTerminal, getTerminalHistory, startTerminal, subscribeTerminal, writeTerminal } = await import("./terminal-manager.ts");
  const id = "tool:terminal:historycheck123";
  t.after(() => closeTerminal(id));
  startTerminal(id, process.cwd(), process.cwd(), "History terminal", 80, 24);
  const completed = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("terminal did not process history input")), 2_000);
    const unsubscribe = subscribeTerminal(id, (event) => {
      if (event.type === "data" && event.data.includes("echo 50")) {
        clearTimeout(timeout);
        unsubscribe();
        resolve(event.data);
      }
    });
    assert.ok(unsubscribe);
  });
  for (let index = 0; index <= 50; index += 1) assert.equal(writeTerminal(id, `echo ${index}\r`), "ok");
  await completed;
  assert.deepEqual(getTerminalHistory(id), Array.from({ length: 50 }, (_, index) => `echo ${50 - index}`));
});

test("a close received before creation prevents an orphaned terminal", async () => {
  const { closeTerminal, listTerminals, startTerminal } = await import("./terminal-manager.ts");
  const id = "tool:terminal:closedbeforestart";
  assert.equal(closeTerminal(id), false);
  assert.equal(startTerminal(id, process.cwd(), process.cwd(), "Closed terminal", 80, 24), null);
  assert.equal(listTerminals(process.cwd()).some((terminal) => terminal.id === id), false);
});
