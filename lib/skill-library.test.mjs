import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  getLibrarySkillsDir,
  scanLibrary,
  getLibrarySkill,
  discoverSkillDir,
  discoverSkillsRecursive,
  librarySkillExists,
  writeLibrarySkill,
  deleteLibrarySkill,
} = await jiti.import("./skill-library.ts");

function dir(p) {
  mkdirSync(p, { recursive: true });
  return p;
}
function file(p, content) {
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, content, "utf8");
}
function skillIn(libraryRoot, key, frontmatter = `name: ${key}\ndescription: ${key} skill`, body = "body") {
  const d = join(getLibrarySkillsDir(libraryRoot), key);
  file(join(d, "SKILL.md"), `---\n${frontmatter}\n---\n${body}\n`);
  if (key === "with-assets") file(join(d, "assets", "x.txt"), "asset");
  return d;
}

test("scanLibrary returns [] when library has no .pi/skills directory", () => {
  const root = mkdtempSync(join(tmpdir(), "pivot-ui-lib-"));
  try {
    assert.deepEqual(scanLibrary(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scanLibrary lists skills with meta + content hash, sorted by skillKey", () => {
  const root = mkdtempSync(join(tmpdir(), "pivot-ui-lib-"));
  try {
    skillIn(root, "zebra");
    skillIn(root, "alpha");
    skillIn(root, "with-assets");
    const skills = scanLibrary(root);
    assert.equal(skills.length, 3);
    assert.equal(skills[0].skillKey, "alpha");
    assert.equal(skills[1].skillKey, "with-assets");
    assert.equal(skills[2].skillKey, "zebra");
    for (const s of skills) {
      assert.match(s.contentHash, /^[0-9a-f]{64}$/);
      assert.equal(s.name, s.skillKey);
      assert.equal(s.description, `${s.skillKey} skill`);
      assert.ok(existsSync(s.filePath));
      assert.ok(existsSync(s.baseDir));
    }
    // with-assets hash incorporates subdirectory content
    const withAssets = skills.find((s) => s.skillKey === "with-assets");
    assert.ok(withAssets.contentHash.length);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scanLibrary falls back to skillKey when frontmatter lacks name", () => {
  const root = mkdtempSync(join(tmpdir(), "pivot-ui-lib-"));
  try {
    skillIn(root, "noname", "description: no name field");
    const [s] = scanLibrary(root);
    assert.equal(s.name, "noname");
    assert.equal(s.description, "no name field");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("getLibrarySkill finds by skillKey case-insensitively, ignores non-skill dirs", () => {
  const root = mkdtempSync(join(tmpdir(), "pivot-ui-lib-"));
  try {
    skillIn(root, "Slides");
    file(join(getLibrarySkillsDir(root), "not-a-skill", "README.md"), "hi");
    const s = getLibrarySkill(root, "slides");
    assert.ok(s);
    assert.equal(s.skillKey, "Slides");
    assert.equal(getLibrarySkill(root, "missing"), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("discoverSkillDir requires a direct SKILL.md child", () => {
  const root = mkdtempSync(join(tmpdir(), "pivot-ui-lib-"));
  try {
    const src = dir(join(root, "src", "my-skill"));
    file(join(src, "SKILL.md"), `---\nname: my-skill\ndescription: d\n---\nb`);
    const d = discoverSkillDir(src);
    assert.equal(d.skillKey, "my-skill");
    assert.equal(d.name, "my-skill");
    assert.match(d.contentHash, /^[0-9a-f]{64}$/);
    assert.throws(() => discoverSkillDir(dir(join(root, "empty"))), /SKILL.md/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("discoverSkillsRecursive finds nested SKILL.md entries", () => {
  const root = mkdtempSync(join(tmpdir(), "pivot-ui-lib-"));
  try {
    const repo = dir(join(root, "repo"));
    file(join(repo, "skills", "a", "SKILL.md"), `---\nname: a\ndescription: a\n---\na`);
    file(join(repo, "skills", "b", "SKILL.md"), `---\nname: b\ndescription: b\n---\nb`);
    file(join(repo, "nested", "deep", "c", "SKILL.md"), `---\nname: c\ndescription: c\n---\nc`);
    file(join(repo, "README.md"), "nope");
    const found = discoverSkillsRecursive(repo);
    const keys = found.map((s) => s.skillKey).sort();
    assert.deepEqual(keys, ["a", "b", "c"]);
    for (const s of found) assert.ok(s.relPath.endsWith("SKILL.md"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writeLibrarySkill copies a skill into the library and computes its hash", () => {
  const root = mkdtempSync(join(tmpdir(), "pivot-ui-lib-"));
  try {
    const src = dir(join(root, "src", "ppt"));
    file(join(src, "SKILL.md"), `---\nname: ppt\ndescription: d\n---\nb`);
    file(join(src, "assets", "logo.txt"), "logo");
    const written = writeLibrarySkill(root, "ppt", src);
    assert.equal(written.skillKey, "ppt");
    assert.ok(librarySkillExists(root, "ppt"));
    assert.ok(existsSync(join(getLibrarySkillsDir(root), "ppt", "assets", "logo.txt")));
    // hash matches the source
    const redisc = discoverSkillDir(src);
    assert.equal(written.contentHash, redisc.contentHash);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("librarySkillExists is case-insensitive", () => {
  const root = mkdtempSync(join(tmpdir(), "pivot-ui-lib-"));
  try {
    skillIn(root, "Slides");
    assert.ok(librarySkillExists(root, "slides"));
    assert.ok(librarySkillExists(root, "SLIDES"));
    assert.ok(!librarySkillExists(root, "nope"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("deleteLibrarySkill removes an unreferenced skill", () => {
  const root = mkdtempSync(join(tmpdir(), "pivot-ui-lib-"));
  try {
    skillIn(root, "slides");
    const res = deleteLibrarySkill(root, "slides", []);
    assert.equal(res.ok, true);
    assert.ok(!existsSync(join(getLibrarySkillsDir(root), "slides")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("deleteLibrarySkill refuses a skill referenced by a pack", () => {
  const root = mkdtempSync(join(tmpdir(), "pivot-ui-lib-"));
  try {
    skillIn(root, "slides");
    const referencedBy = [
      { packId: "pack-1", packName: "PPT大师" },
    ];
    const res = deleteLibrarySkill(root, "slides", referencedBy);
    assert.equal(res.ok, false);
    assert.match(res.error, /referenced/i);
    assert.deepEqual(res.referencedBy, referencedBy);
    assert.ok(existsSync(join(getLibrarySkillsDir(root), "slides")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});