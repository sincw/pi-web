import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  getWorkspaceStatePath,
  readWorkspaceState,
  writeWorkspaceState,
  upsertAppliedPack,
  removeAppliedPack,
  getAppliedPack,
  unionSkillRefs,
} = await jiti.import("./workspace-packs.ts");

function pack(id, name, refs) {
  return { id, name, description: "", skills: refs };
}
function ref(key, hash) {
  return { skillKey: key, contentHash: hash };
}

test("readWorkspaceState returns an empty state when the file is missing", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-web-ws-"));
  try {
    const state = readWorkspaceState({ cwd: root });
    assert.equal(state.version, 1);
    assert.deepEqual(state.appliedPacks, []);
    assert.deepEqual(state.skippedConflicts, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writeWorkspaceState round-trips through .pi/skill-packs.json", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-web-ws-"));
  try {
    const state = {
      version: 1,
      appliedPacks: [
        {
          packId: "p1",
          status: "full",
          receipt: { appliedAt: "t", installed: [ref("slides", "h")] },
        },
      ],
      skippedConflicts: [{ packId: "p1", skillKey: "outline", reason: "same_name_exists" }],
    };
    writeWorkspaceState(state, { cwd: root });
    assert.ok(existsSync(getWorkspaceStatePath(root)));
    const read = readWorkspaceState({ cwd: root });
    assert.deepEqual(read.appliedPacks, state.appliedPacks);
    assert.deepEqual(read.skippedConflicts, state.skippedConflicts);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("upsertAppliedPack inserts then updates by packId (pure)", () => {
  const base = { version: 1, appliedPacks: [], skippedConflicts: [] };
  const applied = {
    packId: "p1",
    status: "full",
    receipt: { appliedAt: "t", installed: [ref("slides", "h")] },
  };
  const next = upsertAppliedPack(base, applied, []);
  assert.equal(next.appliedPacks.length, 1);
  assert.equal(base.appliedPacks.length, 0);
  const updated = upsertAppliedPack(next, { ...applied, status: "partial" }, [
    { packId: "p1", skillKey: "outline", reason: "same_name_exists" },
  ]);
  assert.equal(updated.appliedPacks[0].status, "partial");
  assert.equal(updated.skippedConflicts.length, 1);
});

test("removeAppliedPack removes the tag and its conflict records but keeps fs skill files", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-web-ws-"));
  try {
    // Simulate an installed skill on disk that must survive tag removal
    const skillDir = join(root, ".pi", "skills", "slides");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "---\nname: slides\n---\nx");

    const base = {
      version: 1,
      appliedPacks: [
        {
          packId: "p1",
          status: "full",
          receipt: { appliedAt: "t", installed: [ref("slides", "h")] },
        },
      ],
      skippedConflicts: [{ packId: "p1", skillKey: "outline", reason: "same_name_exists" }],
    };
    const next = removeAppliedPack(base, "p1");
    assert.equal(next.appliedPacks.length, 0);
    assert.equal(next.skippedConflicts.length, 0);
    writeWorkspaceState(next, { cwd: root });
    // skill files untouched
    assert.ok(existsSync(join(skillDir, "SKILL.md")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("unionSkillRefs dedupes the same key+hash and blocks differing hashes", () => {
  const p1 = pack("a", "A", [ref("slides", "h1"), ref("outline", "h2")]);
  const p2 = pack("b", "B", [ref("slides", "h1"), ref("review", "h3")]);
  const { refs, conflicts } = unionSkillRefs([p1, p2]);
  const keys = refs.map((r) => r.skillKey).sort();
  assert.deepEqual(keys, ["outline", "review", "slides"]);
  assert.equal(refs.find((r) => r.skillKey === "slides").contentHash, "h1");
  assert.deepEqual(conflicts, []);
});

test("unionSkillRefs reports version conflicts for the same key with different hashes", () => {
  const p1 = pack("a", "A", [ref("slides", "h1")]);
  const p2 = pack("b", "B", [ref("slides", "h2")]);
  const { refs, conflicts } = unionSkillRefs([p1, p2]);
  assert.ok(refs.find((r) => r.skillKey === "slides") !== undefined);
  // slides is conflicted; the union keeps one ref but flags a conflict
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].skillKey, "slides");
  assert.deepEqual(conflicts[0].contentHashes.sort(), ["h1", "h2"]);
  assert.deepEqual(conflicts[0].packIds.sort(), ["a", "b"]);
});

test("unionSkillRefs is case-insensitive on skillKey", () => {
  const p1 = pack("a", "A", [ref("Slides", "h1")]);
  const p2 = pack("b", "B", [ref("slides", "h1")]);
  const { refs, conflicts } = unionSkillRefs([p1, p2]);
  assert.equal(refs.length, 1);
  assert.equal(conflicts.length, 0);
});

test("getAppliedPack looks up by packId", () => {
  const state = {
    version: 1,
    appliedPacks: [{ packId: "p1", status: "full", receipt: { appliedAt: "", installed: [] } }],
    skippedConflicts: [],
  };
  assert.ok(getAppliedPack(state, "p1"));
  assert.equal(getAppliedPack(state, "missing"), null);
});