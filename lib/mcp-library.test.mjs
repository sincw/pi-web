import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { createLibraryMcpServer, deleteLibraryMcpServer, getLibraryMcpServer, validateMcpDefinition } = await jiti.import("./mcp-library.ts");

test("MCP library accepts env references but rejects direct credentials and tools", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-web-mcp-library-"));
  try {
    const server = createLibraryMcpServer(root, "example", {
      definition: { command: "npx", env: { API_KEY: "${API_KEY}" } },
    });
    assert.equal(server.definition.env.API_KEY, "${API_KEY}");
    assert.throws(
      () => validateMcpDefinition({ url: "https://example.test", headers: { Authorization: "Bearer secret" } }),
      /Authorization headers are not allowed/,
    );
    assert.throws(
      () => validateMcpDefinition({ command: "npx", directTools: true }),
      /global adapter configuration/,
    );
    assert.throws(
      () => validateMcpDefinition({ url: "https://example.test", bearerToken: "secret" }),
      /not supported/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("MCP library deletion refuses servers referenced by packs", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-web-mcp-library-"));
  try {
    createLibraryMcpServer(root, "example", { definition: { command: "npx" } });
    const referencedBy = [{ packId: "pack-1", packName: "Example Pack" }];
    const blocked = deleteLibraryMcpServer(root, "example", referencedBy);
    assert.equal(blocked.ok, false);
    assert.deepEqual(blocked.referencedBy, referencedBy);
    assert.ok(getLibraryMcpServer(root, "example"));

    assert.equal(deleteLibraryMcpServer(root, "example", []).ok, true);
    assert.equal(getLibraryMcpServer(root, "example"), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
