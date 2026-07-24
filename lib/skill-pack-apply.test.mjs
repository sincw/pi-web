import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { preview, applyPlan } = await jiti.import("./skill-pack-apply.ts");
const { computeSkillHash } = await jiti.import("./content-hash.ts");

function pack(id, name, refs) {
  return { id, name, description: "", skills: refs };
}
function ref(key, hash) {
  return { skillKey: key, contentHash: hash };
}
function skill(base, key, body, extra) {
  const dir = join(base, key);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${key}\ndescription: d\n---\n${body}\n`);
  if (extra) writeFileSync(join(dir, "extra.txt"), extra);
  return dir;
}
function readState(cwd) {
  return JSON.parse(readFileSync(join(cwd, ".pi", "skill-packs.json"), "utf8"));
}

function setup() {
  const root = mkdtempSync(join(tmpdir(), "pivot-ui-apply-"));
  const cwd = join(root, "project");
  const libRoot = join(root, "lib");
  const libSkills = join(libRoot, ".pi", "skills");
  const projSkills = join(cwd, ".pi", "skills");
  mkdirSync(cwd, { recursive: true });
  return { root, cwd, libRoot, libSkills, projSkills };
}
function hash(base, key) {
  return computeSkillHash(join(base, key));
}

test("preview installs all missing skills when no conflicts exist", () => {
  const { root, cwd, libRoot, libSkills } = setup();
  try {
    skill(libSkills, "slides", "s");
    skill(libSkills, "outline", "o");
    const config = {
      version: 1,
      libraryRoot: libRoot,
      packs: [pack("p1", "PPT", [ref("slides", hash(libSkills, "slides")), ref("outline", hash(libSkills, "outline"))])],
    };
    const plan = preview(cwd, libRoot, ["p1"], config);
    assert.equal(plan.canApply, true);
    assert.equal(plan.toInstall.length, 2);
    assert.equal(plan.skipped.length, 0);
    assert.equal(plan.blocked.length, 0);
    assert.equal(plan.versionConflicts.length, 0);
    assert.equal(plan.packs[0].status, "full");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("preview skips pre-existing project skills and marks pack partial", () => {
  const { root, cwd, libRoot, libSkills, projSkills } = setup();
  try {
    skill(libSkills, "slides", "s");
    skill(libSkills, "outline", "o");
    skill(projSkills, "slides", "different"); // pre-existing
    const config = {
      version: 1,
      libraryRoot: libRoot,
      packs: [pack("p1", "PPT", [ref("slides", hash(libSkills, "slides")), ref("outline", hash(libSkills, "outline"))])],
    };
    const plan = preview(cwd, libRoot, ["p1"], config);
    assert.equal(plan.canApply, true);
    assert.equal(plan.toInstall.length, 1);
    assert.equal(plan.toInstall[0].skillKey, "outline");
    assert.equal(plan.skipped.length, 1);
    assert.equal(plan.skipped[0].skillKey, "slides");
    assert.equal(plan.skipped[0].reason, "same_name_exists");
    assert.equal(plan.packs[0].status, "partial");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("preview blocks when a pack references a missing or stale library skill", () => {
  const { root, cwd, libRoot, libSkills } = setup();
  try {
    skill(libSkills, "slides", "s");
    const config = {
      version: 1,
      libraryRoot: libRoot,
      packs: [pack("p1", "PPT", [ref("slides", "wrong"), ref("missing", "x")])],
    };
    const plan = preview(cwd, libRoot, ["p1"], config);
    assert.equal(plan.canApply, false);
    assert.equal(plan.blocked.length, 2);
    const keys = plan.blocked.map((b) => b.skillKey).sort();
    assert.deepEqual(keys, ["missing", "slides"]);
    assert.equal(plan.toInstall.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("preview blocks when two packs reference the same skillKey with different hashes", () => {
  const { root, cwd, libRoot, libSkills } = setup();
  try {
    skill(libSkills, "slides", "s");
    const config = {
      version: 1,
      libraryRoot: libRoot,
      packs: [pack("p1", "A", [ref("slides", "h1")]), pack("p2", "B", [ref("slides", "h2")])],
    };
    const plan = preview(cwd, libRoot, ["p1", "p2"], config);
    assert.equal(plan.canApply, false);
    assert.equal(plan.versionConflicts.length, 1);
    assert.deepEqual(plan.versionConflicts[0].contentHashes.sort(), ["h1", "h2"]);
    assert.deepEqual(plan.versionConflicts[0].packIds.sort(), ["p1", "p2"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("applyPlan copies skills and writes workspace state with full status", () => {
  const { root, cwd, libRoot, libSkills } = setup();
  try {
    skill(libSkills, "slides", "s", "asset");
    skill(libSkills, "outline", "o");
    const config = {
      version: 1,
      libraryRoot: libRoot,
      packs: [pack("p1", "PPT", [ref("slides", hash(libSkills, "slides")), ref("outline", hash(libSkills, "outline"))])],
    };
    const plan = preview(cwd, libRoot, ["p1"], config);
    const result = applyPlan(cwd, libRoot, plan, { now: () => "2025-01-01T00:00:00.000Z" });
    assert.equal(result.installed.length, 2);
    assert.ok(existsSync(join(cwd, ".pi", "skills", "slides", "SKILL.md")));
    assert.ok(existsSync(join(cwd, ".pi", "skills", "slides", "extra.txt")));
    const state = readState(cwd);
    assert.equal(state.appliedPacks.length, 1);
    assert.equal(state.appliedPacks[0].status, "full");
    assert.equal(state.appliedPacks[0].receipt.appliedAt, "2025-01-01T00:00:00.000Z");
    assert.equal(state.skippedConflicts.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("applyPlan preserves pre-existing skills and records partial status + skipped conflicts", () => {
  const { root, cwd, libRoot, libSkills, projSkills } = setup();
  try {
    skill(libSkills, "slides", "lib-slides");
    skill(libSkills, "outline", "lib-outline");
    skill(projSkills, "slides", "pre-existing"); // must stay
    const config = {
      version: 1,
      libraryRoot: libRoot,
      packs: [pack("p1", "PPT", [ref("slides", hash(libSkills, "slides")), ref("outline", hash(libSkills, "outline"))])],
    };
    const plan = preview(cwd, libRoot, ["p1"], config);
    applyPlan(cwd, libRoot, plan, { now: () => "t" });
    assert.equal(readFileSync(join(cwd, ".pi", "skills", "slides", "SKILL.md"), "utf8").includes("pre-existing"), true);
    const state = readState(cwd);
    assert.equal(state.appliedPacks[0].status, "partial");
    assert.equal(state.skippedConflicts[0].skillKey, "slides");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("applyPlan rolls back newly created skills when a later copy fails", () => {
  const { root, cwd, libRoot, libSkills } = setup();
  try {
    skill(libSkills, "a", "1");
    skill(libSkills, "b", "2");
    const config = {
      version: 1,
      libraryRoot: libRoot,
      packs: [pack("p1", "PPT", [ref("a", hash(libSkills, "a")), ref("b", hash(libSkills, "b"))])],
    };
    const plan = preview(cwd, libRoot, ["p1"], config);
    let calls = 0;
    const copyFn = (src, dest) => {
      calls++;
      if (calls === 2) throw new Error("boom");
      cpSync(src, dest, { recursive: true });
    };
    assert.throws(() => applyPlan(cwd, libRoot, plan, { copyFn }), /boom/);
    assert.ok(!existsSync(join(cwd, ".pi", "skills", "a")));
    assert.ok(!existsSync(join(cwd, ".pi", "skills", "b")));
    assert.ok(!existsSync(join(cwd, ".pi", "skill-packs.json")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("applyPlan keeps previously applied packs when adding a new one", () => {
  const { root, cwd, libRoot, libSkills } = setup();
  try {
    skill(libSkills, "slides", "s");
    skill(libSkills, "outline", "o");
    mkdirSync(join(cwd, ".pi"), { recursive: true });
    writeFileSync(
      join(cwd, ".pi", "skill-packs.json"),
      JSON.stringify({
        version: 1,
        appliedPacks: [{ packId: "old", status: "full", receipt: { appliedAt: "t", installed: [] } }],
        skippedConflicts: [],
      }),
    );
    const config = {
      version: 1,
      libraryRoot: libRoot,
      packs: [pack("new", "N", [ref("slides", hash(libSkills, "slides"))])],
    };
    const plan = preview(cwd, libRoot, ["new"], config);
    applyPlan(cwd, libRoot, plan);
    const state = readState(cwd);
    assert.equal(state.appliedPacks.length, 2);
    assert.ok(state.appliedPacks.some((p) => p.packId === "old"));
    assert.ok(state.appliedPacks.some((p) => p.packId === "new"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const { unapplyPack } = await jiti.import("./skill-pack-apply.ts");
const { readWorkspaceState } = await jiti.import("./workspace-packs.ts");

test("unapplyPack removes skills owned by the pack definition even when they were skipped", () => {
  const { root, cwd, libRoot, libSkills, projSkills } = setup();
  try {
    skill(libSkills, "slides", "s");
    skill(projSkills, "slides", "pre-existing");
    const config = {
      version: 1,
      libraryRoot: libRoot,
      packs: [pack("p1", "Deck", [ref("slides", hash(libSkills, "slides"))])],
    };
    // slides is skipped because it already exists in the project.
    applyPlan(cwd, libRoot, preview(cwd, libRoot, ["p1"], config));
    assert.ok(existsSync(join(cwd, ".pi", "skills", "slides")));

    unapplyPack(cwd, "p1", config);
    const state = readWorkspaceState({ cwd });
    assert.equal(state.appliedPacks.length, 0);
    assert.ok(!existsSync(join(cwd, ".pi", "skills", "slides")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("unapplyPack keeps skills still required by remaining packs", () => {
  const { root, cwd, libRoot, libSkills } = setup();
  try {
    skill(libSkills, "slides", "s");
    skill(libSkills, "outline", "o");
    const config = {
      version: 1,
      libraryRoot: libRoot,
      packs: [
        pack("p1", "Deck", [ref("slides", hash(libSkills, "slides")), ref("outline", hash(libSkills, "outline"))]),
        pack("p2", "Reuse", [ref("slides", hash(libSkills, "slides"))]),
      ],
    };
    applyPlan(cwd, libRoot, preview(cwd, libRoot, ["p1", "p2"], config));

    unapplyPack(cwd, "p1", config);
    const state = readWorkspaceState({ cwd });
    assert.equal(state.appliedPacks.length, 1);
    assert.ok(existsSync(join(cwd, ".pi", "skills", "slides")));
    assert.ok(!existsSync(join(cwd, ".pi", "skills", "outline")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
