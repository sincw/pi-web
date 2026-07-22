import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  createLibraryMcpServer,
  updateLibraryMcpServer,
} = await jiti.import("./mcp-library.ts");
const {
  applyWorkspacePackChange,
  previewWorkspacePackChange,
  WorkspacePlanBlocked,
  WorkspaceRevisionConflict,
} = await jiti.import("./skill-pack-apply.ts");
const { computeSkillHash } = await jiti.import("./content-hash.ts");
const { readWorkspaceState } = await jiti.import("./workspace-packs.ts");

function setup() {
  const root = mkdtempSync(join(tmpdir(), "pi-web-mcp-pack-"));
  const cwd = join(root, "project");
  const libraryRoot = join(root, "library");
  mkdirSync(cwd, { recursive: true });
  return { root, cwd, libraryRoot };
}

function skill(libraryRoot, skillKey) {
  const dir = join(libraryRoot, ".pi", "skills", skillKey);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${skillKey}\n---\nbody\n`);
  return { skillKey, contentHash: computeSkillHash(dir) };
}

function server(libraryRoot, serverKey, definition = { command: "npx", args: ["-y", `${serverKey}-mcp`] }) {
  const created = createLibraryMcpServer(libraryRoot, serverKey, {
    name: serverKey,
    description: "",
    definition,
  });
  return { serverKey: created.serverKey, configHash: created.configHash, definition: created.definition };
}

function reference(server) {
  return { serverKey: server.serverKey, configHash: server.configHash };
}

function pack(id, { skills = [], mcpServers = [] } = {}) {
  return { id, name: id, description: "", skills, mcpServers };
}

function config(libraryRoot, packs) {
  return { version: 2, libraryRoot, packs };
}

function projectMcp(cwd) {
  return JSON.parse(readFileSync(join(cwd, ".pi", "mcp.json"), "utf8"));
}

test("library MCP hashes cover only the definition", () => {
  const { root, libraryRoot } = setup();
  try {
    const created = server(libraryRoot, "alpha");
    const updated = updateLibraryMcpServer(libraryRoot, "alpha", { name: "Renamed", description: "New description" });
    assert.equal(updated.configHash, created.configHash);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a mixed Pack atomically records skills, MCP state, and revision", async () => {
  const { root, cwd, libraryRoot } = setup();
  try {
    const slides = skill(libraryRoot, "slides");
    const alpha = server(libraryRoot, "alpha");
    const packs = config(libraryRoot, [pack("frontend", { skills: [slides], mcpServers: [reference(alpha)] })]);
    const preview = previewWorkspacePackChange(cwd, libraryRoot, ["frontend"], packs);
    assert.equal(preview.canApply, true);
    assert.equal(preview.mcpRelevant, true);
    assert.deepEqual(preview.mcp.toConfigure, [reference(alpha)]);

    await applyWorkspacePackChange(cwd, libraryRoot, ["frontend"], preview.workspaceRevision, packs, { now: () => "t" });

    assert.ok(existsSync(join(cwd, ".pi", "skills", "slides", "SKILL.md")));
    assert.deepEqual(projectMcp(cwd).mcpServers.alpha, alpha.definition);
    const state = readWorkspaceState({ cwd });
    assert.equal(state.revision, 1);
    assert.deepEqual(state.appliedPacks[0].receipt.mcpServers, [reference(alpha)]);
    assert.deepEqual(state.mcp.managedServers, { alpha: { configHash: alpha.configHash } });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reapplying the same Pack set reconciles updated MCP references", async () => {
  const { root, cwd, libraryRoot } = setup();
  try {
    const alpha = server(libraryRoot, "alpha");
    const initial = config(libraryRoot, [pack("servers", { mcpServers: [reference(alpha)] })]);
    await applyWorkspacePackChange(cwd, libraryRoot, ["servers"], 0, initial);

    const updated = updateLibraryMcpServer(libraryRoot, "alpha", { definition: { command: "npx", args: ["-y", "alpha-mcp@2"] } });
    const next = config(libraryRoot, [pack("servers", {
      mcpServers: [{ serverKey: updated.serverKey, configHash: updated.configHash }],
    })]);
    const preview = previewWorkspacePackChange(cwd, libraryRoot, ["servers"], next);
    assert.equal(preview.mcpRelevant, true);

    await applyWorkspacePackChange(cwd, libraryRoot, ["servers"], 1, next);
    assert.deepEqual(projectMcp(cwd).mcpServers.alpha, updated.definition);
    assert.equal(readWorkspaceState({ cwd }).revision, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a stale MCP reference blocks an otherwise skill-only Pack change", async () => {
  const { root, cwd, libraryRoot } = setup();
  try {
    const alpha = server(libraryRoot, "alpha");
    const initial = config(libraryRoot, [pack("servers", { mcpServers: [reference(alpha)] })]);
    await applyWorkspacePackChange(cwd, libraryRoot, ["servers"], 0, initial);

    updateLibraryMcpServer(libraryRoot, "alpha", { definition: { command: "npx", args: ["-y", "alpha-mcp@2"] } });
    const slides = skill(libraryRoot, "slides");
    const next = config(libraryRoot, [
      pack("servers", { mcpServers: [reference(alpha)] }),
      pack("slides", { skills: [slides] }),
    ]);
    const preview = previewWorkspacePackChange(cwd, libraryRoot, ["servers", "slides"], next);

    assert.equal(preview.mcpRelevant, false);
    assert.equal(preview.canApply, false);
    assert.deepEqual(preview.mcp.blocked, [{ serverKey: "alpha", reason: "hash_mismatch_in_library" }]);
    await assert.rejects(
      applyWorkspacePackChange(cwd, libraryRoot, ["servers", "slides"], 1, next),
      WorkspacePlanBlocked,
    );
    assert.ok(!existsSync(join(cwd, ".pi", "skills", "slides")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the locked apply rechecks adapter readiness before MCP writes", async () => {
  const { root, cwd, libraryRoot } = setup();
  try {
    const alpha = server(libraryRoot, "alpha");
    const packs = config(libraryRoot, [pack("servers", { mcpServers: [reference(alpha)] })]);

    await assert.rejects(
      applyWorkspacePackChange(cwd, libraryRoot, ["servers"], 0, packs, {
        ensureMcpAdapter: () => { throw new Error("MCP_ADAPTER_REQUIRED"); },
      }),
      /MCP_ADAPTER_REQUIRED/,
    );
    assert.ok(!existsSync(join(cwd, ".pi", "mcp.json")));
    assert.ok(!existsSync(join(cwd, ".pi", "skill-packs.json")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a failed workspace receipt write restores MCP and newly copied skills", async () => {
  const { root, cwd, libraryRoot } = setup();
  try {
    const slides = skill(libraryRoot, "slides");
    const alpha = server(libraryRoot, "alpha");
    const packs = config(libraryRoot, [pack("frontend", { skills: [slides], mcpServers: [reference(alpha)] })]);
    const piDir = join(cwd, ".pi");
    mkdirSync(piDir, { recursive: true });
    const mcpPath = join(piDir, "mcp.json");
    const before = '{\n  "settings": { "keep": true },\n  "mcpServers": { "manual": { "command": "manual" } }\n}\n';
    writeFileSync(mcpPath, before);
    mkdirSync(join(piDir, "skill-packs.json"));

    await assert.rejects(
      applyWorkspacePackChange(cwd, libraryRoot, ["frontend"], 0, packs),
    );
    assert.equal(readFileSync(mcpPath, "utf8"), before);
    assert.ok(!existsSync(join(cwd, ".pi", "skills", "slides")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("shared MCP references stay until the final Pack removal", async () => {
  const { root, cwd, libraryRoot } = setup();
  try {
    const alpha = server(libraryRoot, "alpha");
    const packs = config(libraryRoot, [
      pack("one", { mcpServers: [reference(alpha)] }),
      pack("two", { mcpServers: [reference(alpha)] }),
    ]);
    await applyWorkspacePackChange(cwd, libraryRoot, ["one", "two"], 0, packs);
    await applyWorkspacePackChange(cwd, libraryRoot, ["two"], 1, packs);
    assert.deepEqual(projectMcp(cwd).mcpServers.alpha, alpha.definition);

    await applyWorkspacePackChange(cwd, libraryRoot, [], 2, packs);
    assert.deepEqual(projectMcp(cwd).mcpServers, {});
    assert.deepEqual(readWorkspaceState({ cwd }).mcp.managedServers, {});
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("missing, stale, and conflicting MCP references block without workspace writes", () => {
  const { root, cwd, libraryRoot } = setup();
  try {
    const alpha = server(libraryRoot, "alpha");
    const packs = config(libraryRoot, [
      pack("current", { mcpServers: [reference(alpha)] }),
      pack("stale", { mcpServers: [{ serverKey: "alpha", configHash: "old" }] }),
      pack("missing", { mcpServers: [{ serverKey: "missing", configHash: "none" }] }),
    ]);
    const preview = previewWorkspacePackChange(cwd, libraryRoot, ["current", "stale", "missing"], packs);
    assert.equal(preview.canApply, false);
    assert.equal(preview.mcp.versionConflicts.length, 1);
    assert.deepEqual(preview.mcp.blocked.map((entry) => entry.serverKey), ["missing"]);
    const stale = previewWorkspacePackChange(cwd, libraryRoot, ["stale", "missing"], packs);
    assert.deepEqual(stale.mcp.blocked.map((entry) => entry.serverKey).sort(), ["alpha", "missing"]);
    assert.ok(!existsSync(join(cwd, ".pi", "mcp.json")));
    assert.ok(!existsSync(join(cwd, ".pi", "skill-packs.json")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("team and external project entries remain outside Pack ownership", async () => {
  const { root, cwd, libraryRoot } = setup();
  try {
    const alpha = server(libraryRoot, "alpha");
    const beta = server(libraryRoot, "beta");
    const packs = config(libraryRoot, [pack("servers", { mcpServers: [reference(alpha), reference(beta)] })]);
    mkdirSync(join(cwd, ".pi"), { recursive: true });
    writeFileSync(join(cwd, ".mcp.json"), JSON.stringify({ mcpServers: { alpha: { command: "team" } } }));
    writeFileSync(join(cwd, ".pi", "mcp.json"), JSON.stringify({
      settings: { keep: true },
      imports: ["manual.json"],
      mcpServers: { beta: { command: "manual" }, manual: { command: "manual" } },
    }));

    const preview = previewWorkspacePackChange(cwd, libraryRoot, ["servers"], packs);
    assert.deepEqual(preview.mcp.skipped.map((entry) => [entry.serverKey, entry.reason]).sort(), [
      ["alpha", "shadowed_by_team_config"],
      ["beta", "same_name_exists_external"],
    ]);
    await applyWorkspacePackChange(cwd, libraryRoot, ["servers"], 0, packs);

    assert.deepEqual(projectMcp(cwd), {
      settings: { keep: true },
      imports: ["manual.json"],
      mcpServers: { beta: { command: "manual" }, manual: { command: "manual" } },
    });
    assert.deepEqual(readWorkspaceState({ cwd }).mcp.managedServers, {});
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("manual edits to a managed MCP entry survive Pack removal", async () => {
  const { root, cwd, libraryRoot } = setup();
  try {
    const alpha = server(libraryRoot, "alpha");
    const packs = config(libraryRoot, [pack("servers", { mcpServers: [reference(alpha)] })]);
    await applyWorkspacePackChange(cwd, libraryRoot, ["servers"], 0, packs);
    writeFileSync(join(cwd, ".pi", "mcp.json"), JSON.stringify({ mcpServers: { alpha: { command: "edited" } } }));

    await applyWorkspacePackChange(cwd, libraryRoot, [], 1, packs);
    assert.deepEqual(projectMcp(cwd).mcpServers, { alpha: { command: "edited" } });
    assert.deepEqual(readWorkspaceState({ cwd }).mcp.managedServers, {});
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a stale workspace revision is rejected without changing state", async () => {
  const { root, cwd, libraryRoot } = setup();
  try {
    const alpha = server(libraryRoot, "alpha");
    const packs = config(libraryRoot, [pack("servers", { mcpServers: [reference(alpha)] })]);
    await applyWorkspacePackChange(cwd, libraryRoot, ["servers"], 0, packs);
    const before = readFileSync(join(cwd, ".pi", "mcp.json"), "utf8");

    await assert.rejects(
      applyWorkspacePackChange(cwd, libraryRoot, [], 0, packs),
      WorkspaceRevisionConflict,
    );
    assert.equal(readFileSync(join(cwd, ".pi", "mcp.json"), "utf8"), before);
    assert.equal(readWorkspaceState({ cwd }).revision, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
