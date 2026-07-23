import assert from "node:assert/strict";
import test from "node:test";

async function createRun() {
  const { AgentRunState } = await import("./agent-run-state.ts");
  return new AgentRunState();
}

test("ignores an idle reconciliation response from an older run", async () => {
  const run = await createRun();
  const firstRun = run.start();
  assert.equal(run.finish(firstRun), true);

  const currentRun = run.start();
  assert.equal(run.reconcile(firstRun, false), "ignore");
  assert.equal(run.running, true);
  assert.equal(run.runId, currentRun);
});

test("finishes a current run when reconciliation finds missed SSE completion", async () => {
  const run = await createRun();
  const currentRun = run.start();

  assert.equal(run.reconcile(currentRun, false), "finish");
  assert.equal(run.finish(currentRun), true);
  assert.equal(run.running, false);
});

test("defers pack reload while a prompt is running", async () => {
  const run = await createRun();
  const currentRun = run.start();

  assert.equal(run.requestPackReload(), "deferred");
  assert.equal(run.finish(currentRun), true);
  assert.equal(run.requestPackReload(), "ready");
});

test("waits for a pending Pack reload before starting the next prompt", async () => {
  const run = await createRun();
  let releaseReload;
  const reloadStarted = new Promise((resolve) => {
    releaseReload = resolve;
  });
  let promptStarted = false;

  run.requestPackReload();
  const send = (async () => {
    await run.reloadPacks(async () => reloadStarted);
    promptStarted = true;
  })();

  await Promise.resolve();
  assert.equal(promptStarted, false);
  releaseReload();
  await send;
  assert.equal(promptStarted, true);
});

test("runs a second reload when Packs change during an active reload", async () => {
  const run = await createRun();
  let reloads = 0;
  run.requestPackReload();

  await run.reloadPacks(async () => {
    reloads += 1;
    if (reloads === 1) run.requestPackReload();
  });

  assert.equal(reloads, 2);
});
