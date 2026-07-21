import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { computeSkillHash } from "./content-hash";

const SKILL_FILE = "SKILL.md";

/** Directory under a library root where skill copies live. */
export function getLibrarySkillsDir(libraryRoot: string): string {
  return join(libraryRoot, ".pi", "skills");
}

export interface LibrarySkill {
  /** Directory name (skillKey); case-insensitive for matching. */
  skillKey: string;
  /** Display name from SKILL.md frontmatter, falling back to skillKey. */
  name: string;
  /** Description from frontmatter. */
  description: string;
  /** Absolute skill directory (`<lib>/.pi/skills/<skillKey>`). */
  baseDir: string;
  /** Absolute path to the SKILL.md file. */
  filePath: string;
  /** Deterministic content hash of the skill directory. */
  contentHash: string;
}

/** A skill discovered in an arbitrary directory (local import / git clone). */
export interface DiscoveredSkill {
  /** Proposed skillKey: basename of the directory containing SKILL.md. */
  skillKey: string;
  name: string;
  description: string;
  /** Absolute dir containing SKILL.md. */
  sourceDir: string;
  /** Path of SKILL.md relative to the scan root (empty for single-dir scan). */
  relPath: string;
  contentHash: string;
}

/** One pack that references a skillKey. Used to refuse deletion of in-use skills. */
export interface PackReference {
  packId: string;
  packName: string;
}

type HashFn = (skillDir: string) => string;

interface ReadOpts {
  hashFn?: HashFn;
}

function readMeta(filePath: string): { name?: string; description: string } {
  try {
    const content = readFileSync(filePath, "utf8");
    const { frontmatter } = parseFrontmatter<Record<string, unknown>>(content);
    return {
      name: typeof frontmatter.name === "string" ? frontmatter.name : undefined,
      description:
        typeof frontmatter.description === "string" ? frontmatter.description : "",
    };
  } catch {
    return { description: "" };
  }
}

function lowerKey(skillKey: string): string {
  return skillKey.toLowerCase();
}

function buildLibrarySkill(
  skillKey: string,
  baseDir: string,
  filePath: string,
  hashFn: HashFn,
): LibrarySkill {
  const meta = readMeta(filePath);
  return {
    skillKey,
    name: meta.name || skillKey,
    description: meta.description,
    baseDir,
    filePath,
    contentHash: hashFn(baseDir),
  };
}

/** List every skill copy under `<libraryRoot>/.pi/skills`, sorted by skillKey. */
export function scanLibrary(libraryRoot: string, opts: ReadOpts = {}): LibrarySkill[] {
  const hashFn = opts.hashFn ?? computeSkillHash;
  const dir = getLibrarySkillsDir(libraryRoot);
  if (!existsSync(dir)) return [];
  const skills: LibrarySkill[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillDir = join(dir, entry.name);
    const skillMd = join(skillDir, SKILL_FILE);
    if (!existsSync(skillMd)) continue;
    skills.push(buildLibrarySkill(entry.name, skillDir, skillMd, hashFn));
  }
  return skills.sort((a, b) => a.skillKey.localeCompare(b.skillKey));
}

/** Get a single library skill by skillKey (case-insensitive). */
export function getLibrarySkill(
  libraryRoot: string,
  skillKey: string,
  opts: ReadOpts = {},
): LibrarySkill | null {
  const hashFn = opts.hashFn ?? computeSkillHash;
  const dir = getLibrarySkillsDir(libraryRoot);
  if (!existsSync(dir)) return null;
  const target = lowerKey(skillKey);
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && lowerKey(entry.name) === target) {
      const skillDir = join(dir, entry.name);
      const skillMd = join(skillDir, SKILL_FILE);
      if (!existsSync(skillMd)) return null;
      return buildLibrarySkill(entry.name, skillDir, skillMd, hashFn);
    }
  }
  return null;
}

/** True when a skillKey already exists in the library (case-insensitive). */
export function librarySkillExists(libraryRoot: string, skillKey: string): boolean {
  const dir = getLibrarySkillsDir(libraryRoot);
  if (!existsSync(dir)) return false;
  const target = lowerKey(skillKey);
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && lowerKey(entry.name) === target) return true;
  }
  return false;
}

/**
 * Discover a single skill in `dir` — the directory must contain SKILL.md as a
 * direct child. Throws if it does not.
 */
export function discoverSkillDir(dir: string, opts: ReadOpts = {}): DiscoveredSkill {
  const hashFn = opts.hashFn ?? computeSkillHash;
  const skillMd = join(dir, SKILL_FILE);
  if (!existsSync(skillMd) || !statSync(skillMd).isFile()) {
    throw new Error(`Directory does not contain a direct SKILL.md: ${dir}`);
  }
  const meta = readMeta(skillMd);
  const skillKey = basename(dir);
  return {
    skillKey,
    name: meta.name || skillKey,
    description: meta.description,
    sourceDir: dir,
    relPath: SKILL_FILE,
    contentHash: hashFn(dir),
  };
}

/** Find every SKILL.md under `rootDir`, recursively (git import preview). */
export function discoverSkillsRecursive(
  rootDir: string,
  opts: ReadOpts = {},
): DiscoveredSkill[] {
  const hashFn = opts.hashFn ?? computeSkillHash;
  const out: DiscoveredSkill[] = [];
  walk(rootDir, rootDir, out, hashFn);
  return out;
}

function walk(dir: string, root: string, out: DiscoveredSkill[], hashFn: HashFn): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, root, out, hashFn);
    } else if (entry.isFile() && entry.name === SKILL_FILE) {
      const skillDir = dirname(abs);
      const meta = readMeta(abs);
      out.push({
        skillKey: basename(skillDir),
        name: meta.name || basename(skillDir),
        description: meta.description,
        sourceDir: skillDir,
        relPath: relative(root, abs).split(sep).join("/"),
        contentHash: hashFn(skillDir),
      });
    }
  }
}

interface WriteOpts {
  overwrite?: boolean;
  hashFn?: HashFn;
}

/** Copy `sourceDir` into the library under `skillKey`. Returns the new entry. */
export function writeLibrarySkill(
  libraryRoot: string,
  skillKey: string,
  sourceDir: string,
  opts: WriteOpts = {},
): LibrarySkill {
  const hashFn = opts.hashFn ?? computeSkillHash;
  if (librarySkillExists(libraryRoot, skillKey) && !opts.overwrite) {
    throw new Error(`A skill named "${skillKey}" already exists in the library`);
  }
  const dest = join(getLibrarySkillsDir(libraryRoot), skillKey);
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  cpSync(sourceDir, dest, { recursive: true });
  const skillMd = join(dest, SKILL_FILE);
  return buildLibrarySkill(skillKey, dest, skillMd, hashFn);
}

export interface DeleteResult {
  ok: boolean;
  error?: string;
  referencedBy?: PackReference[];
}

/** Remove a library skill, refusing if any pack still references it. */
export function deleteLibrarySkill(
  libraryRoot: string,
  skillKey: string,
  referencedBy: PackReference[],
): DeleteResult {
  if (referencedBy.length > 0) {
    return {
      ok: false,
      error: `Skill "${skillKey}" is referenced by ${referencedBy.length} pack(s)`,
      referencedBy,
    };
  }
  const dir = getLibrarySkillsDir(libraryRoot);
  const target = lowerKey(skillKey);
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && lowerKey(entry.name) === target) {
      rmSync(join(dir, entry.name), { recursive: true, force: true });
      return { ok: true };
    }
  }
  // Nothing to delete — treat as success (idempotent).
  return { ok: true };
}