import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("waits for a pending pack reload before sending", async () => {
  const [chatWindow, hook] = await Promise.all([
    readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8"),
    readFile(new URL("../hooks/useAgentSession.ts", import.meta.url), "utf8"),
  ]);
  const handleSend = hook.slice(
    hook.indexOf("const handleSend = useCallback"),
    hook.indexOf("const handleAbort = useCallback"),
  );

  assert.match(chatWindow, /packsRefreshKey,/);
  assert.match(hook, /const ensurePackSkillsReloaded = useCallback/);
  assert.match(handleSend, /await ensurePackSkillsReloaded\(\);/);
});

test("collapses mobile pack badges to the first pack", async () => {
  const chatInput = await readFile(new URL("./ChatInput.tsx", import.meta.url), "utf8");

  assert.match(chatInput, /isMobile \? appliedPacks\.slice\(0, 1\) : appliedPacks/);
  assert.match(chatInput, /isMobile && appliedPacks\.length > 1 && "\\u22ef"/);
});

test("keeps the live stream anchored to the real chat tail", async () => {
  const [chatWindow, hook] = await Promise.all([
    readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8"),
    readFile(new URL("../hooks/useAgentSession.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(chatWindow, /agentRunning && \(\s*<div style=\{\{ height: scrollContainerRef\.current/);
  assert.match(hook, /\[streamState\.streamingMessage, scrollToBottom\]/);
});

test("resumes following when the user returns to the live tail", async () => {
  const hook = await readFile(new URL("../hooks/useAgentSession.ts", import.meta.url), "utf8");
  const handleScroll = hook.slice(
    hook.indexOf("const handleScrollPositionChange = useCallback"),
    hook.indexOf("// Load session on mount"),
  );

  assert.match(handleScroll, /const atBottom = container\.scrollHeight - container\.scrollTop - container\.clientHeight <= 1;/);
  assert.match(handleScroll, /if \(atBottom\) \{\s*completionScrollAllowedRef\.current = true;\s*return;/);
});
