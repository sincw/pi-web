import assert from "node:assert/strict";
import test from "node:test";

test("parseGitBranches preserves branch kind and omits remote HEAD aliases", async () => {
  const { parseGitBranches } = await import("./git-branches.ts");
  assert.deepEqual(parseGitBranches("refs/heads/main\t*\nrefs/heads/feature/review\t \nrefs/remotes/origin/main\t \nrefs/remotes/origin/HEAD\t \n"), [
    { name: "main", kind: "local", current: true },
    { name: "feature/review", kind: "local", current: false },
    { name: "origin/main", kind: "remote", current: false },
  ]);
});
