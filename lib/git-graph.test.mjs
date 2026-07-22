import assert from "node:assert/strict";
import test from "node:test";
import { buildCommitGraph } from "./git-graph.ts";

test("buildCommitGraph keeps a branch connected through a merge", () => {
  const rows = buildCommitGraph([
    { sha: "merge", parents: ["main", "feature"] },
    { sha: "main", parents: ["base"] },
    { sha: "feature", parents: ["base"] },
    { sha: "base", parents: [] },
  ]);
  assert.equal(rows[0].lanes, 2);
  assert.deepEqual(rows[0].parents.map(({ to }) => to), [0, 1]);
  assert.equal(rows[2].parents[0].to, 0);
});
