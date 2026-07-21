import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SkillRef, SkillPack } from "./skill-packs-store";

export type PackStatus = "full" | "partial";

export interface Receipt {
  appliedAt: string;
  installed: SkillRef[];
}

export interface AppliedPack {
  packId: string;
  status: PackStatus;
  receipt: Receipt;
}

export interface SkippedConflict {
  packId: string;
  skillKey: string;
  reason: string;
}

export interface WorkspaceState {
  version: 1;
  appliedPacks: AppliedPack[];
  skippedConflicts: SkippedConflict[];
}

export interface SkillRefConflict {
  skillKey: string;
  contentHashes: string[];
  packIds: string[];
}

export interface UnionResult {
  refs: SkillRef[];
  conflicts: SkillRefConflict[];
}

interface PathOpts {
  cwd?: string;
  statePath?: string;
}

function emptyState(): WorkspaceState {
  return { version: 1, appliedPacks: [], skippedConflicts: [] };
}

export function getWorkspaceStatePath(cwd: string): string {
  return join(cwd, ".pi", "skill-packs.json");
}

function resolvePath(opts: PathOpts): string {
  if (opts.statePath) return opts.statePath;
  if (opts.cwd) return getWorkspaceStatePath(opts.cwd);
  throw new Error("workspace-packs: cwd or statePath is required");
}

export function readWorkspaceState(opts: PathOpts): WorkspaceState {
  const path = resolvePath(opts);
  if (!existsSync(path)) return emptyState();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<WorkspaceState>;
    return {
      version: 1,
      appliedPacks: Array.isArray(parsed.appliedPacks) ? parsed.appliedPacks.map(normalizeApplied) : [],
      skippedConflicts: Array.isArray(parsed.skippedConflicts) ? parsed.skippedConflicts.map(normalizeSkipped) : [],
    };
  } catch {
    return emptyState();
  }
}

function normalizeApplied(p: unknown): AppliedPack {
  const raw = p as Partial<AppliedPack>;
  const receipt = raw.receipt ?? { appliedAt: "", installed: [] };
  return {
    packId: typeof raw.packId === "string" ? raw.packId : "",
    status: raw.status === "partial" ? "partial" : "full",
    receipt: {
      appliedAt: typeof receipt.appliedAt === "string" ? receipt.appliedAt : "",
      installed: Array.isArray(receipt.installed) ? receipt.installed : [],
    },
  };
}

function normalizeSkipped(s: unknown): SkippedConflict {
  const raw = s as Partial<SkippedConflict>;
  return {
    packId: typeof raw.packId === "string" ? raw.packId : "",
    skillKey: typeof raw.skillKey === "string" ? raw.skillKey : "",
    reason: typeof raw.reason === "string" ? raw.reason : "",
  };
}

export function writeWorkspaceState(state: WorkspaceState, opts: PathOpts): void {
  const path = resolvePath(opts);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

export function getAppliedPack(state: WorkspaceState, packId: string): AppliedPack | null {
  return state.appliedPacks.find((p) => p.packId === packId) ?? null;
}

/** Insert or replace an applied pack, and refresh its skipped-conflict records (pure). */
export function upsertAppliedPack(
  state: WorkspaceState,
  applied: AppliedPack,
  conflicts: SkippedConflict[],
): WorkspaceState {
  const others = state.appliedPacks.filter((p) => p.packId !== applied.packId);
  const otherConflicts = state.skippedConflicts.filter((c) => c.packId !== applied.packId);
  return {
    version: 1,
    appliedPacks: [...others, applied],
    skippedConflicts: [...otherConflicts, ...conflicts],
  };
}

/**
 * Remove a pack tag from the workspace state (pure). Only state is mutated —
 * project skill files are never touched by tag removal.
 */
export function removeAppliedPack(state: WorkspaceState, packId: string): WorkspaceState {
  return {
    version: 1,
    appliedPacks: state.appliedPacks.filter((p) => p.packId !== packId),
    skippedConflicts: state.skippedConflicts.filter((c) => c.packId !== packId),
  };
}

/**
 * Compute the union of skill references across packs (the install set), plus
 * any same-key/different-hash version conflicts that must block application.
 */
export function unionSkillRefs(packs: SkillPack[]): UnionResult {
  const byKey = new Map<string, SkillRef>();
  const packIdsByKey = new Map<string, string[]>();
  const hashesByKey = new Map<string, string[]>();
  for (const pack of packs) {
    for (const ref of pack.skills) {
      const key = ref.skillKey.toLowerCase();
      const existingRef = byKey.get(key);
      if (!existingRef) {
        byKey.set(key, ref);
        packIdsByKey.set(key, [pack.id]);
        hashesByKey.set(key, [ref.contentHash]);
      } else {
        packIdsByKey.get(key)!.push(pack.id);
        const hashes = hashesByKey.get(key)!;
        if (!hashes.includes(ref.contentHash)) hashes.push(ref.contentHash);
      }
    }
  }

  const refs: SkillRef[] = [];
  const conflicts: SkillRefConflict[] = [];
  for (const [key, ref] of byKey) {
    refs.push(ref);
    const hashes = hashesByKey.get(key)!;
    if (hashes.length > 1) {
      conflicts.push({
        skillKey: ref.skillKey,
        contentHashes: hashes,
        packIds: packIdsByKey.get(key)!,
      });
    }
  }
  return { refs, conflicts };
}

/**
 * Collect the set of skill keys that are still required by the applied packs
 * remaining in `state`. Uses current pack definitions from `packsConfig` when
 * available; falls back to each pack's receipt for packs no longer in config.
 */
export function collectRequiredSkillKeys(state: WorkspaceState, packsConfig: { packs: SkillPack[] }): Set<string> {
  const required = new Set<string>();
  for (const applied of state.appliedPacks) {
    const pack = packsConfig.packs.find((p) => p.id.toLowerCase() === applied.packId.toLowerCase());
    if (pack) {
      for (const ref of pack.skills) {
        required.add(ref.skillKey.toLowerCase());
      }
    } else {
      for (const ref of applied.receipt.installed) {
        required.add(ref.skillKey.toLowerCase());
      }
    }
  }
  return required;
}