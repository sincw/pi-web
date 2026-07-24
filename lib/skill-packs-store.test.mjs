import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  readConfig,
  writeConfig,
  createPack,
  updatePack,
  deletePack,
  setLibraryRoot,
  updatePackSkillHash,
  findPacksReferencingMcpServerKey,
  findPacksReferencingSkillKey,
  getPackById,
  ensureLibraryRoot,
} = await jiti.import("./skill-packs-store.ts");

function cfgPath(root) {
  return join(root, "skill-packs.json");
}

test("readConfig returns an empty config when the file is missing", () => {
  const root = mkdtempSync(join(tmpdir(), "pivot-ui-packs-"));
  try {
    const c = readConfig({ configPath: cfgPath(root) });
    assert.equal(c.version, 2);
    assert.equal(c.libraryRoot, null);
    assert.deepEqual(c.packs, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readConfig tolerates malformed JSON", () => {
  const root = mkdtempSync(join(tmpdir(), "pivot-ui-packs-"));
  try {
    writeFileSync(cfgPath(root), "not json {");
    const c = readConfig({ configPath: cfgPath(root) });
    assert.equal(c.version, 2);
    assert.deepEqual(c.packs, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readConfig migrates v1 packs with no MCP references", () => {
  const root = mkdtempSync(join(tmpdir(), "pivot-ui-packs-"));
  try {
    const path = cfgPath(root);
    writeFileSync(path, JSON.stringify({
      version: 1,
      libraryRoot: "/library",
      packs: [{ id: "p1", name: "PPT", description: "", skills: [{ skillKey: "slides", contentHash: "h" }] }],
    }));
    const config = readConfig({ configPath: path });
    assert.equal(config.version, 2);
    assert.deepEqual(config.packs[0].mcpServers, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writeConfig round-trips and writes to the given path", () => {
  const root = mkdtempSync(join(tmpdir(), "pivot-ui-packs-"));
  try {
    const path = cfgPath(root);
    writeConfig(
      {
        version: 2,
        libraryRoot: "/home/me/skills",
        packs: [{ id: "p1", name: "PPT", description: "d", skills: [{ skillKey: "slides", contentHash: "h" }], mcpServers: [] }],
      },
      { configPath: path },
    );
    assert.ok(existsSync(path));
    const read = readConfig({ configPath: path });
    assert.equal(read.libraryRoot, "/home/me/skills");
    assert.equal(read.packs.length, 1);
    assert.equal(read.packs[0].skills[0].skillKey, "slides");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writeConfig is atomic when nested dir is missing", () => {
  const root = mkdtempSync(join(tmpdir(), "pivot-ui-packs-"));
  try {
    const path = join(root, "nested", "deep", "skill-packs.json");
    writeConfig({ version: 2, libraryRoot: null, packs: [] }, { configPath: path });
    assert.ok(existsSync(path));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("createPack adds a pack with a generated id", () => {
  let counter = 0;
  const uuid = () => `id-${++counter}`;
  const base = { version: 2, libraryRoot: null, packs: [] };
  const { config, pack } = createPack(base, { name: "PPT大师", description: "演示文稿" }, { uuid });
  assert.equal(pack.id, "id-1");
  assert.equal(pack.name, "PPT大师");
  assert.equal(pack.skills.length, 0);
  assert.equal(config.packs.length, 1);
  // pure: input not mutated
  assert.equal(base.packs.length, 0);
});

test("updatePack edits name/description/skills and ignores unknown id", () => {
  const base = {
    version: 2,
    libraryRoot: null,
    packs: [{ id: "p1", name: "old", description: "", skills: [], mcpServers: [] }],
  };
  const next = updatePack(base, "p1", { name: "new" });
  assert.equal(next.packs[0].name, "new");
  assert.equal(base.packs[0].name, "old");
  const noop = updatePack(base, "missing", { name: "x" });
  assert.equal(noop.packs[0].name, "old");
});

test("deletePack removes a pack but nothing else", () => {
  const base = {
    version: 2,
    libraryRoot: null,
    packs: [
      { id: "p1", name: "a", description: "", skills: [], mcpServers: [] },
      { id: "p2", name: "b", description: "", skills: [], mcpServers: [] },
    ],
  };
  const next = deletePack(base, "p1");
  assert.equal(next.packs.length, 1);
  assert.equal(next.packs[0].id, "p2");
});

test("setLibraryRoot returns a new config with the updated root", () => {
  const base = { version: 2, libraryRoot: null, packs: [] };
  const next = setLibraryRoot(base, "/tmp/lib");
  assert.equal(next.libraryRoot, "/tmp/lib");
  assert.equal(base.libraryRoot, null);
});

test("updatePackSkillHash updates an existing reference only", () => {
  const base = {
    version: 2,
    libraryRoot: null,
    packs: [
      {
        id: "p1",
        name: "x",
        description: "",
        skills: [{ skillKey: "slides", contentHash: "old" }],
        mcpServers: [],
      },
    ],
  };
  const next = updatePackSkillHash(base, "p1", "slides", "new");
  assert.equal(next.packs[0].skills[0].contentHash, "new");
  const unchanged = updatePackSkillHash(next, "p1", "missing", "z");
  assert.equal(unchanged.packs[0].skills[0].contentHash, "new");
  const noPack = updatePackSkillHash(next, "nope", "slides", "z");
  assert.equal(noPack, next);
});

test("findPacksReferencingSkillKey lists packs referencing a skillKey (case-insensitive)", () => {
  const base = {
    version: 2,
    libraryRoot: null,
    packs: [
      { id: "a", name: "A", description: "", skills: [{ skillKey: "slides", contentHash: "h" }], mcpServers: [] },
      { id: "b", name: "B", description: "", skills: [{ skillKey: "outline", contentHash: "h" }], mcpServers: [] },
      { id: "c", name: "C", description: "", skills: [{ skillKey: "Slides", contentHash: "h" }], mcpServers: [] },
    ],
  };
  const refs = findPacksReferencingSkillKey(base, "slides");
  assert.equal(refs.length, 2);
  assert.deepEqual(refs.map((r) => r.packId).sort(), ["a", "c"]);
});

test("findPacksReferencingMcpServerKey lists packs referencing a server key", () => {
  const base = {
    version: 2,
    libraryRoot: null,
    packs: [
      { id: "a", name: "A", description: "", skills: [], mcpServers: [{ serverKey: "browser", configHash: "h" }] },
      { id: "b", name: "B", description: "", skills: [], mcpServers: [{ serverKey: "other", configHash: "h" }] },
      { id: "c", name: "C", description: "", skills: [], mcpServers: [{ serverKey: "Browser", configHash: "h" }] },
    ],
  };
  assert.deepEqual(findPacksReferencingMcpServerKey(base, "browser").map((ref) => ref.packId).sort(), ["a", "c"]);
});

test("getPackById returns the pack or null", () => {
  const base = { version: 2, libraryRoot: null, packs: [{ id: "p1", name: "x", description: "", skills: [], mcpServers: [] }] };
  assert.ok(getPackById(base, "p1"));
  assert.equal(getPackById(base, "missing"), null);
});

test("ensureLibraryRoot initializes the default library root and creates the skills subdirectory", () => {
  const root = mkdtempSync(join(tmpdir(), "pivot-ui-packs-"));
  try {
    const path = cfgPath(root);
    const base = { version: 2, libraryRoot: null, packs: [] };
    const next = ensureLibraryRoot(base, { configPath: path });
    assert.ok(next.libraryRoot);
    assert.ok(existsSync(join(next.libraryRoot, ".pi", "skills")));
    const reRead = readConfig({ configPath: path });
    assert.equal(reRead.libraryRoot, next.libraryRoot);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
