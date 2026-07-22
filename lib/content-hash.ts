import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * OS metadata and editor backup files that must not participate in a skill's
 * content hash. Matching is basename-only, case-insensitive, so the list
 * covers `.DS_Store` (macOS), `Thumbs.db` (Windows), and `~*` editor backups.
 */
const EXCLUDED_FILENAMES = new Set([".ds_store", "thumbs.db"]);

function isExcluded(basename: string): boolean {
  const lower = basename.toLowerCase();
  return EXCLUDED_FILENAMES.has(lower) || lower.startsWith("~");
}

function walk(dir: string, root: string, entries: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (isExcluded(entry)) continue;
    const abs = join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) {
      walk(abs, root, entries);
    } else if (st.isFile()) {
      entries.push(relative(root, abs).split(sep).join("/"));
    }
  }
}

/**
 * Deterministic content hash for a skill directory.
 *
 * The hash is SHA-256 over every file under `skillDir`, sorted by
 * POSIX-normalized relative path. Each file contributes
 * `"<relative-path>:<file-bytes>"` to the digest. OS metadata
 * (`.DS_Store`, `Thumbs.db`) and editor backups (`~*`) are skipped so the
 * hash is stable across platforms and checkouts.
 */
export function computeSkillHash(skillDir: string): string {
  const entries: string[] = [];
  walk(skillDir, skillDir, entries);
  entries.sort();
  const hasher = createHash("sha256");
  for (const rel of entries) {
    hasher.update(`${rel}:`);
    hasher.update(readFileSync(join(skillDir, ...rel.split("/"))));
  }
  return hasher.digest("hex");
}

/** Deterministic SHA-256 for JSON data, independent of object key order. */
export function computeConfigHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Cannot hash non-finite JSON numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(",")}}`;
  }
  throw new Error("Cannot hash non-JSON values");
}
