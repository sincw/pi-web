import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { getLibrarySkillsDir } from "./skill-library";

export interface SkillRef {
  /** Directory name of the skill copy in the library. */
  skillKey: string;
  /** Content hash of the skill as it was when added to the pack. */
  contentHash: string;
}

export interface SkillPack {
  id: string;
  name: string;
  description: string;
  skills: SkillRef[];
}

export interface SkillPacksConfig {
  version: 1;
  libraryRoot: string | null;
  packs: SkillPack[];
}

export interface PackReference {
  packId: string;
  packName: string;
}

interface PathOpts {
  configPath?: string;
}

interface Deps {
  uuid?: () => string;
}

function emptyConfig(): SkillPacksConfig {
  return { version: 1, libraryRoot: null, packs: [] };
}

/** Default location of the global skill-packs config (~/.pi/agent/skill-packs.json). */
export function getDefaultConfigPath(): string {
  return join(getAgentDir(), "skill-packs.json");
}

/** Default skill library root when the user has not configured one. */
export function getDefaultLibraryRoot(): string {
  return join(homedir(), ".pi-web", "lib", "skills");
}

/**
 * Return the config, initializing the default library root if none is set.
 * Persists the default back to disk and creates `<root>/.pi/skills`.
 */
export function ensureLibraryRoot(config: SkillPacksConfig, opts: PathOpts = {}): SkillPacksConfig {
  if (config.libraryRoot) return config;
  const root = getDefaultLibraryRoot();
  const skillsDir = getLibrarySkillsDir(root);
  if (!existsSync(skillsDir)) mkdirSync(skillsDir, { recursive: true });
  const next = { ...config, libraryRoot: root };
  writeConfig(next, opts);
  return next;
}

/** Read the global config, returning an empty config when missing or malformed. */
export function readConfig(opts: PathOpts = {}): SkillPacksConfig {
  const path = opts.configPath ?? getDefaultConfigPath();
  if (!existsSync(path)) return emptyConfig();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<SkillPacksConfig>;
    return {
      version: 1,
      libraryRoot: typeof parsed.libraryRoot === "string" ? parsed.libraryRoot : null,
      packs: Array.isArray(parsed.packs) ? parsed.packs.map(normalizePack) : [],
    };
  } catch {
    return emptyConfig();
  }
}

function normalizePack(p: unknown): SkillPack {
  const raw = p as Partial<SkillPack>;
  return {
    id: typeof raw.id === "string" ? raw.id : "",
    name: typeof raw.name === "string" ? raw.name : "",
    description: typeof raw.description === "string" ? raw.description : "",
    skills: Array.isArray(raw.skills) ? raw.skills.map(normalizeRef) : [],
  };
}

function normalizeRef(s: unknown): SkillRef {
  const raw = s as Partial<SkillRef>;
  return {
    skillKey: typeof raw.skillKey === "string" ? raw.skillKey : "",
    contentHash: typeof raw.contentHash === "string" ? raw.contentHash : "",
  };
}

/** Atomically write the config (temp file + rename), creating any missing dirs. */
export function writeConfig(config: SkillPacksConfig, opts: PathOpts = {}): void {
  const path = opts.configPath ?? getDefaultConfigPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

export function getPackById(config: SkillPacksConfig, id: string): SkillPack | null {
  return config.packs.find((p) => p.id === id) ?? null;
}

interface CreatePackInput {
  name: string;
  description?: string;
}

export interface CreatePackResult {
  config: SkillPacksConfig;
  pack: SkillPack;
}

/** Add a new pack and return the new config + the created pack (pure). */
export function createPack(
  config: SkillPacksConfig,
  input: CreatePackInput,
  deps: Deps = {},
): CreatePackResult {
  const uuid = deps.uuid ?? randomUUID;
  const pack: SkillPack = {
    id: uuid(),
    name: input.name,
    description: input.description ?? "",
    skills: [],
  };
  return { config: { ...config, packs: [...config.packs, pack] }, pack };
}

export interface UpdatePackInput {
  name?: string;
  description?: string;
  skills?: SkillRef[];
}

/** Edit a pack by id (pure); packs not found are returned unchanged. */
export function updatePack(config: SkillPacksConfig, id: string, patch: UpdatePackInput): SkillPacksConfig {
  if (!getPackById(config, id)) return config;
  return {
    ...config,
    packs: config.packs.map((p) =>
      p.id === id
        ? {
            id,
            name: patch.name ?? p.name,
            description: patch.description ?? p.description,
            skills: patch.skills ?? p.skills,
          }
        : p,
    ),
  };
}

/** Delete a pack by id (pure). */
export function deletePack(config: SkillPacksConfig, id: string): SkillPacksConfig {
  return { ...config, packs: config.packs.filter((p) => p.id !== id) };
}

/** Return a new config with the libraryRoot replaced. */
export function setLibraryRoot(config: SkillPacksConfig, libraryRoot: string): SkillPacksConfig {
  return { ...config, libraryRoot };
}

/**
 * Update the contentHash stored on a pack's skill reference (pure). Used after a
 * library skill is edited so the user can explicitly refresh stale references.
 * Returns the same config object when the pack or skill is not found.
 */
export function updatePackSkillHash(
  config: SkillPacksConfig,
  packId: string,
  skillKey: string,
  newHash: string,
): SkillPacksConfig {
  const pack = getPackById(config, packId);
  if (!pack) return config;
  if (!pack.skills.some((s) => s.skillKey.toLowerCase() === skillKey.toLowerCase())) {
    return config;
  }
  return {
    ...config,
    packs: config.packs.map((p) =>
      p.id === packId
        ? {
            ...p,
            skills: p.skills.map((s) =>
              s.skillKey.toLowerCase() === skillKey.toLowerCase()
                ? { ...s, contentHash: newHash }
                : s,
            ),
          }
        : p,
    ),
  };
}

/** List packs that reference the given skillKey (case-insensitive). */
export function findPacksReferencingSkillKey(
  config: SkillPacksConfig,
  skillKey: string,
): PackReference[] {
  const target = skillKey.toLowerCase();
  return config.packs
    .filter((p) => p.skills.some((s) => s.skillKey.toLowerCase() === target))
    .map((p) => ({ packId: p.id, packName: p.name }));
}