import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { SkillPack, SkillPacksConfig } from "./skill-packs-store";
import { getLibrarySkill } from "./skill-library";
import {
  unionSkillRefs,
  upsertAppliedPack,
  removeAppliedPack,
  collectRequiredSkillKeys,
  type PackStatus,
  type SkippedConflict,
  type AppliedPack,
  readWorkspaceState,
  writeWorkspaceState,
} from "./workspace-packs";

export interface PreviewEntry {
  skillKey: string;
  contentHash: string;
}

export interface SkippedEntry {
  skillKey: string;
  reason: string;
}

export interface BlockedEntry {
  skillKey: string;
  reason: string;
}

export interface VersionConflict {
  skillKey: string;
  contentHashes: string[];
  packIds: string[];
}

export interface PackPlan {
  packId: string;
  packName: string;
  status: PackStatus;
  toInstall: PreviewEntry[];
  skipped: SkippedEntry[];
}

export interface ApplyPlan {
  toInstall: PreviewEntry[];
  skipped: SkippedEntry[];
  blocked: BlockedEntry[];
  versionConflicts: VersionConflict[];
  packs: PackPlan[];
  canApply: boolean;
}

export interface ApplyResult {
  installed: PreviewEntry[];
  skipped: SkippedEntry[];
  statePath: string;
}

interface PreviewDeps {
  librarySkill?: (libraryRoot: string, skillKey: string) => { skillKey: string; baseDir: string; contentHash: string } | null;
  projectSkillExists?: (cwd: string, skillKey: string) => boolean;
}

interface ApplyDeps {
  now?: () => string;
  copyFn?: (src: string, dest: string) => void;
  librarySkill?: (libraryRoot: string, skillKey: string) => { skillKey: string; baseDir: string; contentHash: string } | null;
}

function defaultLibrarySkill(libraryRoot: string, skillKey: string) {
  return getLibrarySkill(libraryRoot, skillKey);
}

function defaultProjectSkillExists(cwd: string, skillKey: string): boolean {
  const skillsDir = join(cwd, ".pi", "skills");
  if (!existsSync(skillsDir)) return false;
  const target = skillKey.toLowerCase();
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.toLowerCase() !== target) continue;
    if (existsSync(join(skillsDir, entry.name, "SKILL.md"))) return true;
  }
  return false;
}

function defaultCopyFn(src: string, dest: string): void {
  cpSync(src, dest, { recursive: true });
}

function nowFn(): string {
  return new Date().toISOString();
}

/** Resolve target packs by id from the global config. */
function resolveTargetPacks(config: SkillPacksConfig, ids: string[]): SkillPack[] {
  return ids
    .map((id) => config.packs.find((p) => p.id === id))
    .filter((p): p is SkillPack => Boolean(p));
}

/**
 * Build an immutable apply plan: which skills to install, which to skip,
 * and which block the operation because they are missing/stale/version-conflicted.
 */
export function preview(
  cwd: string,
  libraryRoot: string,
  targetPackIds: string[],
  config: SkillPacksConfig,
  deps: PreviewDeps = {},
): ApplyPlan {
  const librarySkill = deps.librarySkill ?? defaultLibrarySkill;
  const projectSkillExists = deps.projectSkillExists ?? defaultProjectSkillExists;
  const packs = resolveTargetPacks(config, targetPackIds);
  const { refs, conflicts } = unionSkillRefs(packs);

  const blocked: BlockedEntry[] = [];
  const toInstall: PreviewEntry[] = [];
  const skipped: SkippedEntry[] = [];

  for (const ref of refs) {
    const lib = librarySkill(libraryRoot, ref.skillKey);
    if (!lib) {
      blocked.push({ skillKey: ref.skillKey, reason: "missing_in_library" });
      continue;
    }
    if (lib.contentHash !== ref.contentHash) {
      blocked.push({ skillKey: ref.skillKey, reason: "hash_mismatch_in_library" });
      continue;
    }
    if (projectSkillExists(cwd, ref.skillKey)) {
      skipped.push({ skillKey: ref.skillKey, reason: "same_name_exists" });
    } else {
      toInstall.push({ skillKey: ref.skillKey, contentHash: ref.contentHash });
    }
  }

  const packPlans: PackPlan[] = packs.map((p) => {
    const pToInstall: PreviewEntry[] = [];
    const pSkipped: SkippedEntry[] = [];
    for (const ref of p.skills) {
      const blockedReason = blocked.find((b) => b.skillKey.toLowerCase() === ref.skillKey.toLowerCase())?.reason;
      const skippedReason = skipped.find((s) => s.skillKey.toLowerCase() === ref.skillKey.toLowerCase())?.reason;
      if (skippedReason) {
        pSkipped.push({ skillKey: ref.skillKey, reason: skippedReason });
      } else if (!blockedReason) {
        pToInstall.push({ skillKey: ref.skillKey, contentHash: ref.contentHash });
      }
    }
    return {
      packId: p.id,
      packName: p.name,
      status: pSkipped.length === 0 ? "full" : "partial",
      toInstall: pToInstall,
      skipped: pSkipped,
    };
  });

  const canApply = blocked.length === 0 && conflicts.length === 0;
  return {
    toInstall,
    skipped,
    blocked,
    versionConflicts: conflicts,
    packs: packPlans,
    canApply,
  };
}

/**
 * Execute a plan: copy library skills into the project, then persist the workspace
 * state with receipts and skipped-conflict records. Atomic per skill: each copy
 * is staged to a temp directory and renamed; failures roll back newly created dirs.
 */
export function applyPlan(
  cwd: string,
  libraryRoot: string,
  plan: ApplyPlan,
  deps: ApplyDeps = {},
): ApplyResult {
  if (!plan.canApply) {
    throw new Error("applyPlan called on a plan that cannot be applied");
  }
  const librarySkill = deps.librarySkill ?? defaultLibrarySkill;
  const copyFn = deps.copyFn ?? defaultCopyFn;
  const now = deps.now ?? nowFn;
  const projectSkillsDir = join(cwd, ".pi", "skills");
  if (!existsSync(projectSkillsDir)) mkdirSync(projectSkillsDir, { recursive: true });

  const created: string[] = [];
  const installed: PreviewEntry[] = [];

  try {
    for (const entry of plan.toInstall) {
      const lib = librarySkill(libraryRoot, entry.skillKey);
      if (!lib || lib.contentHash !== entry.contentHash) {
        throw new Error(`Skill "${entry.skillKey}" is no longer available at the expected hash in the library`);
      }
      const dest = join(projectSkillsDir, entry.skillKey);
      const tmp = `${dest}.tmp-${randomUUID()}`;
      copyFn(lib.baseDir, tmp);
      // Rename is atomic on the same filesystem; this is the public point.
      if (existsSync(dest)) {
        rmSync(tmp, { recursive: true, force: true });
        throw new Error(`Destination "${dest}" already exists unexpectedly`);
      }
      renameSync(tmp, dest);
      created.push(dest);
      installed.push({ skillKey: entry.skillKey, contentHash: entry.contentHash });
    }
  } catch (error) {
    for (const path of created) {
      rmSync(path, { recursive: true, force: true });
    }
    throw error;
  }

  const state = readWorkspaceState({ cwd });
  for (const packPlan of plan.packs) {
    const conflicts: SkippedConflict[] = packPlan.skipped.map((s) => ({
      packId: packPlan.packId,
      skillKey: s.skillKey,
      reason: s.reason,
    }));
    const applied = {
      packId: packPlan.packId,
      status: packPlan.status,
      receipt: { appliedAt: now(), installed: packPlan.toInstall.map((r) => ({ skillKey: r.skillKey, contentHash: r.contentHash })) },
    };
    const nextState = upsertAppliedPack(state, applied, conflicts);
    Object.assign(state, nextState);
  }
  writeWorkspaceState(state, { cwd });

  return { installed, skipped: plan.skipped, statePath: join(cwd, ".pi", "skill-packs.json") };
}

export interface UnapplyOptions {
  existsSync?: typeof existsSync;
  rmSync?: typeof rmSync;
}

/**
 * Remove a pack label from the workspace and delete any skills it installed
 * that are no longer required by remaining applied packs. If another applied
 * pack still references the same skill key, the skill is kept.
 */
export function unapplyPack(
  cwd: string,
  packId: string,
  packsConfig: SkillPacksConfig,
  opts: UnapplyOptions = {},
): AppliedPack | null {
  const state = readWorkspaceState({ cwd });
  const idx = state.appliedPacks.findIndex((p) => p.packId.toLowerCase() === packId.toLowerCase());
  if (idx === -1) return null;

  const removed = state.appliedPacks[idx];
  const remaining = { ...state, appliedPacks: state.appliedPacks.filter((_, i) => i !== idx) };
  const required = collectRequiredSkillKeys(remaining, packsConfig);

  // Use the current pack definition to decide which skills this pack "owned".
  // If the pack has been deleted from the library, fall back to the receipt.
  const removedPack = packsConfig.packs.find((p) => p.id.toLowerCase() === packId.toLowerCase());
  const skillsToConsider = removedPack ? removedPack.skills : removed.receipt.installed;

  const _existsSync = opts.existsSync ?? existsSync;
  const _rmSync = opts.rmSync ?? rmSync;
  for (const ref of skillsToConsider) {
    if (!required.has(ref.skillKey.toLowerCase())) {
      const dir = join(cwd, ".pi", "skills", ref.skillKey);
      if (_existsSync(dir)) _rmSync(dir, { recursive: true, force: true });
    }
  }

  const next = removeAppliedPack(state, packId);
  writeWorkspaceState(next, { cwd });
  return removed;
}