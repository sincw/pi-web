import assert from "node:assert/strict";
import test from "node:test";

async function loadSubject() {
  return import("./chat-viewport-state.ts");
}

test("recognizes the scroll tail with one-pixel tolerance", async () => {
  const { isAtScrollTail } = await loadSubject();
  assert.equal(isAtScrollTail(1_000, 799, 200), true);
  assert.equal(isAtScrollTail(1_000, 798, 200), false);
});

test("changes completion following only after explicit user scroll intent", async () => {
  const { getCompletionScrollAllowed } = await loadSubject();
  const base = { current: true, atTail: false, now: 100, ignoreProgrammaticScrollUntil: 0 };

  assert.equal(getCompletionScrollAllowed({ ...base, userScrollIntentUntil: 200 }), false);
  assert.equal(getCompletionScrollAllowed({ ...base, userScrollIntentUntil: 50 }), true);
  assert.equal(getCompletionScrollAllowed({ ...base, ignoreProgrammaticScrollUntil: 200, userScrollIntentUntil: 200 }), true);
  assert.equal(getCompletionScrollAllowed({ ...base, atTail: true, userScrollIntentUntil: 200 }), true);
});
