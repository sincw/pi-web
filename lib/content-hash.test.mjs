import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { computeConfigHash, computeSkillHash } = await jiti.import("./content-hash.ts");

function dir(root) {
  mkdirSync(root, { recursive: true });
  return root;
}
function file(path, content) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content, "utf8");
}

test("empty directory hashes to a stable value distinct from non-empty", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-web-hash-"));
  try {
    const empty = join(root, "empty");
    dir(empty);
    const one = join(root, "one");
    dir(one);
    file(join(one, "SKILL.md"), "---\nname: x\n---\nbody\n");

    const hEmpty = computeSkillHash(empty);
    const hOne = computeSkillHash(one);
    assert.match(hEmpty, /^[0-9a-f]{64}$/);
    assert.match(hOne, /^[0-9a-f]{64}$/);
    assert.notEqual(hEmpty, hOne);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("content path and bytes both participate in the hash", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-web-hash-"));
  try {
    const a = join(root, "a");
    dir(a);
    file(join(a, "SKILL.md"), "hello");
    const b = join(root, "b");
    dir(b);
    file(join(b, "other.md"), "hello");
    const c = join(root, "c");
    dir(c);
    file(join(c, "SKILL.md"), "world");
    const ha = computeSkillHash(a);
    const hb = computeSkillHash(b);
    const hc = computeSkillHash(c);
    assert.notEqual(ha, hb);
    assert.notEqual(ha, hc);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("sort order is stable and recursive across subdirectories", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-web-hash-"));
  try {
    const x = join(root, "x");
    dir(x);
    file(join(x, "SKILL.md"), "1");
    file(join(x, "docs", "intro.md"), "2");
    file(join(x, "examples", "a.md"), "3");
    const y = join(root, "y");
    dir(y);
    file(join(y, "examples", "a.md"), "3");
    file(join(y, "docs", "intro.md"), "2");
    file(join(y, "SKILL.md"), "1");

    assert.equal(computeSkillHash(x), computeSkillHash(y));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("OS metadata and backup files are excluded", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-web-hash-"));
  try {
    const clean = join(root, "clean");
    dir(clean);
    file(join(clean, "SKILL.md"), "body");
    const noisy = join(root, "noisy");
    dir(noisy);
    file(join(noisy, "SKILL.md"), "body");
    file(join(noisy, ".DS_Store"), "junk");
    file(join(noisy, "Thumbs.db"), "junk");
    file(join(noisy, "~SKILL.md.bak"), "backup");
    file(join(noisy, "sub", ".DS_Store"), "junk");

    assert.equal(computeSkillHash(clean), computeSkillHash(noisy));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("single-file directory produces the documented digest", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-web-hash-"));
  try {
    const d = join(root, "known");
    dir(d);
    file(join(d, "SKILL.md"), "body");
    const expected = createHash("sha256").update("SKILL.md:body").digest("hex");
    assert.equal(computeSkillHash(d), expected);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("config hashing is stable for nested object key order", () => {
  const first = {
    command: "npx",
    env: { TOKEN: "${TOKEN}", REGION: "us-east-1" },
    args: ["-y", "example-mcp"],
  };
  const second = {
    args: ["-y", "example-mcp"],
    env: { REGION: "us-east-1", TOKEN: "${TOKEN}" },
    command: "npx",
  };
  assert.equal(computeConfigHash(first), computeConfigHash(second));
  assert.notEqual(computeConfigHash(first), computeConfigHash({ ...second, args: ["example-mcp"] }));
});
