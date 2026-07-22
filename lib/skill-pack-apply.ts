import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { SkillPack, SkillPacksConfig } from "./skill-packs-store";
import { getLibrarySkill } from "./skill-library";
import { commitMcpReconciliation, previewMcpReconciliation, restoreMcpReconciliation, type McpPlan } from "./mcp-pack-apply";
import {
  unionSkillRefs,
  upsertAppliedPack,
  removeAppliedPack,
  collectRequiredSkillKeys,
  type PackStatus,
  type SkippedConflict,
  type AppliedPack,
  type WorkspaceState,
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

export interface WorkspacePackPlan extends ApplyPlan {
  workspaceRevision: number;
  targetPackIds: string[];
  mcp: McpPlan;
  mcpRelevant: boolean;
}

interface PreviewDeps {
  librarySkill?: (libraryRoot: string, skillKey: string) => { skillKey: string; baseDir: string; contentHash: string } | null;
  projectSkillExists?: (cwd: string, skillKey: string) => boolean;
}

interface ApplyDeps {
  now?: () => string;
  copyFn?: (src: string, dest: string) => void;
  librarySkill?: (libraryRoot: string, skillKey: string) => { skillKey: string; baseDir: string; contentHash: string } | null;
  ensureMcpAdapter?: () => void;
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

function copyPlanSkills(
  cwd: string,
  libraryRoot: string,
  plan: ApplyPlan,
  deps: ApplyDeps = {},
): { created: string[]; installed: PreviewEntry[] } {
  const librarySkill = deps.librarySkill ?? defaultLibrarySkill;
  const copyFn = deps.copyFn ?? defaultCopyFn;
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
      try {
        copyFn(lib.baseDir, tmp);
        if (existsSync(dest)) {
          rmSync(tmp, { recursive: true, force: true });
          throw new Error(`Destination "${dest}" already exists unexpectedly`);
        }
        renameSync(tmp, dest);
        created.push(dest);
        installed.push({ skillKey: entry.skillKey, contentHash: entry.contentHash });
      } catch (error) {
        rmSync(tmp, { recursive: true, force: true });
        throw error;
      }
    }
  } catch (error) {
    for (const path of created) rmSync(path, { recursive: true, force: true });
    throw error;
  }
  return { created, installed };
}

/** Resolve target packs by id from the global config. */
function resolveTargetPacks(config: SkillPacksConfig, ids: string[], state?: WorkspaceState): SkillPack[] {
  return ids.flatMap((id) => {
    const pack = config.packs.find((candidate) => candidate.id === id);
    if (pack) return [pack];
    const applied = state?.appliedPacks.find((candidate) => candidate.packId === id);
    return applied ? [{
      id: applied.packId,
      name: applied.packId,
      description: "",
      skills: applied.receipt.installed,
      mcpServers: applied.receipt.mcpServers,
    }] : [];
  });
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
  const now = deps.now ?? nowFn;
  let copied: { created: string[]; installed: PreviewEntry[] } | null = null;
  try {
    copied = copyPlanSkills(cwd, libraryRoot, plan, deps);

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
        receipt: { appliedAt: now(), installed: packPlan.toInstall.map((r) => ({ skillKey: r.skillKey, contentHash: r.contentHash })), mcpServers: [] },
      };
      const nextState = upsertAppliedPack(state, applied, conflicts);
      Object.assign(state, nextState);
    }
    writeWorkspaceState(state, { cwd });
    return { installed: copied.installed, skipped: plan.skipped, statePath: join(cwd, ".pi", "skill-packs.json") };
  } catch (error) {
    for (const path of copied?.created ?? []) rmSync(path, { recursive: true, force: true });
    throw error;
  }
}

function normalizeTargetIds(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => typeof id === "string" && id.trim()))];
}

function hasMcpRefs(pack: SkillPack | undefined): boolean {
  return Boolean(pack?.mcpServers?.length);
}

function sameMcpRefs(left: { serverKey: string; configHash: string }[], right: { serverKey: string; configHash: string }[]): boolean {
  if (left.length !== right.length) return false;
  const normalized = (refs: typeof left) => refs.map((ref) => `${lower(ref.serverKey)}\0${ref.configHash}`).sort();
  const normalizedLeft = normalized(left);
  const normalizedRight = normalized(right);
  return normalizedLeft.every((ref, index) => ref === normalizedRight[index]);
}

function skippedMcpForPack(pack: SkillPack, mcp: McpPlan): SkippedConflict[] {
  return mcp.skipped
    .filter((entry) => pack.mcpServers.some((ref) => lower(ref.serverKey) === lower(entry.serverKey)))
    .map((entry) => ({ packId: pack.id, serverKey: entry.serverKey, reason: entry.reason }));
}

function buildWorkspacePlan(
  cwd: string,
  libraryRoot: string,
  targetPackIds: string[],
  config: SkillPacksConfig,
  state: WorkspaceState,
): WorkspacePackPlan {
  const targetIds = normalizeTargetIds(targetPackIds);
  const targetPacks = resolveTargetPacks(config, targetIds, state);
  const newIds = targetIds.filter((id) => !state.appliedPacks.some((pack) => pack.packId === id));
  const skillPlan = preview(cwd, libraryRoot, newIds, config);
  const mcpInScope = targetPacks.some(hasMcpRefs)
    || state.appliedPacks.some((pack) => pack.receipt.mcpServers.length > 0)
    || Object.keys(state.mcp.managedServers).length > 0;
  const reconciliation = mcpInScope ? previewMcpReconciliation(cwd, libraryRoot, targetPacks, state) : null;
  const mcp: McpPlan = reconciliation?.plan ?? {
    toConfigure: [], skipped: [], blocked: [], versionConflicts: [], canApply: true,
  };
  const addedMcp = newIds.some((id) => hasMcpRefs(config.packs.find((pack) => pack.id === id)));
  const removedMcp = state.appliedPacks
    .filter((pack) => !targetIds.includes(pack.packId))
    .some((pack) => pack.receipt.mcpServers.length > 0);
  const changedMcp = state.appliedPacks.some((applied) => {
    if (!targetIds.includes(applied.packId)) return false;
    const pack = config.packs.find((candidate) => candidate.id === applied.packId);
    return Boolean(pack && !sameMcpRefs(pack.mcpServers, applied.receipt.mcpServers));
  });
  const mcpRelevant = addedMcp || removedMcp || changedMcp || Boolean(reconciliation?.nextProjectConfig);
  return {
    ...skillPlan,
    workspaceRevision: state.revision,
    targetPackIds: targetIds,
    mcp,
    mcpRelevant,
    canApply: skillPlan.canApply && mcp.canApply,
  };
}

/** Build a preview for the full desired workspace Pack set. */
export function previewWorkspacePackChange(
  cwd: string,
  libraryRoot: string,
  targetPackIds: string[],
  config: SkillPacksConfig,
): WorkspacePackPlan {
  return buildWorkspacePlan(cwd, libraryRoot, targetPackIds, config, readWorkspaceState({ cwd }));
}

interface StagedRemoval {
  original: string;
  staged: string;
}

function stageRemovedSkills(cwd: string, state: WorkspaceState, targetIds: string[], config: SkillPacksConfig): StagedRemoval[] {
  const remaining = { ...state, appliedPacks: state.appliedPacks.filter((pack) => targetIds.includes(pack.packId)) };
  const required = collectRequiredSkillKeys(remaining, config);
  const staged: StagedRemoval[] = [];
  for (const removed of state.appliedPacks.filter((pack) => !targetIds.includes(pack.packId))) {
    const definition = config.packs.find((pack) => pack.id === removed.packId);
    for (const ref of definition?.skills ?? removed.receipt.installed) {
      if (required.has(ref.skillKey.toLowerCase())) continue;
      const original = join(cwd, ".pi", "skills", ref.skillKey);
      if (!existsSync(original)) continue;
      const temporary = `${original}.tmp-remove-${randomUUID()}`;
      renameSync(original, temporary);
      staged.push({ original, staged: temporary });
    }
  }
  return staged;
}

function restoreRemovedSkills(staged: StagedRemoval[]): void {
  for (const item of staged.reverse()) {
    if (existsSync(item.staged)) renameSync(item.staged, item.original);
  }
}

function discardRemovedSkills(staged: StagedRemoval[]): void {
  for (const item of staged) rmSync(item.staged, { recursive: true, force: true });
}

function nextWorkspaceState(
  state: WorkspaceState,
  plan: WorkspacePackPlan,
  config: SkillPacksConfig,
  now: () => string,
  nextMcp: WorkspaceState["mcp"],
): WorkspaceState {
  let next = state;
  for (const applied of state.appliedPacks) {
    if (!plan.targetPackIds.includes(applied.packId)) next = removeAppliedPack(next, applied.packId);
  }
  for (const applied of state.appliedPacks) {
    if (!plan.targetPackIds.includes(applied.packId)) continue;
    const pack = config.packs.find((candidate) => candidate.id === applied.packId);
    if (!pack || sameMcpRefs(pack.mcpServers, applied.receipt.mcpServers)) continue;
    const mcpSkipped = skippedMcpForPack(pack, plan.mcp);
    next = upsertAppliedPack(next, {
      ...applied,
      status: applied.status === "partial" || mcpSkipped.length > 0 ? "partial" : "full",
      receipt: { ...applied.receipt, appliedAt: now(), mcpServers: pack.mcpServers },
    }, [
      ...state.skippedConflicts.filter((entry) => entry.packId === pack.id && entry.skillKey),
      ...mcpSkipped,
    ]);
  }
  for (const packPlan of plan.packs) {
    const pack = config.packs.find((candidate) => candidate.id === packPlan.packId);
    if (!pack) continue;
    const mcpSkipped = skippedMcpForPack(pack, plan.mcp);
    const conflicts: SkippedConflict[] = [
      ...packPlan.skipped.map((entry) => ({ packId: pack.id, skillKey: entry.skillKey, reason: entry.reason })),
      ...mcpSkipped,
    ];
    next = upsertAppliedPack(next, {
      packId: pack.id,
      status: packPlan.status === "partial" || mcpSkipped.length > 0 ? "partial" : "full",
      receipt: {
        appliedAt: now(),
        installed: packPlan.toInstall.map((entry) => ({ skillKey: entry.skillKey, contentHash: entry.contentHash })),
        mcpServers: pack.mcpServers,
      },
    }, conflicts);
  }
  return { ...next, version: 2, revision: state.revision + 1, mcp: nextMcp };
}

function lower(value: string): string {
  return value.toLowerCase();
}

const workspaceLocks = globalThis as typeof globalThis & { __piWorkspacePackLocks?: Map<string, Promise<void>> };

async function withWorkspaceLock<T>(cwd: string, action: () => Promise<T>): Promise<T> {
  const locks = workspaceLocks.__piWorkspacePackLocks ??= new Map();
  const previous = locks.get(cwd) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  // ponytail: in-process lock; add cross-process locking only for multi-instance deployments.
  const queued = previous.then(() => current);
  locks.set(cwd, queued);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (locks.get(cwd) === queued) locks.delete(cwd);
  }
}

export class WorkspaceRevisionConflict extends Error {
  constructor(readonly revision: number) {
    super("Workspace Pack state changed; preview again before applying");
  }
}

export class WorkspacePlanBlocked extends Error {
  constructor(readonly plan: WorkspacePackPlan) {
    super("Workspace Pack plan cannot be applied");
  }
}

/**
 * Commit a full desired Pack set. The plan is recomputed under the workspace
 * lock so a browser preview can only explain the operation, never authorize it.
 */
export async function applyWorkspacePackChange(
  cwd: string,
  libraryRoot: string,
  targetPackIds: string[],
  expectedRevision: number,
  config: SkillPacksConfig,
  deps: ApplyDeps = {},
): Promise<{ plan: WorkspacePackPlan; installed: PreviewEntry[] }> {
  return withWorkspaceLock(cwd, async () => {
    const state = readWorkspaceState({ cwd });
    if (state.revision !== expectedRevision) throw new WorkspaceRevisionConflict(state.revision);
    const plan = buildWorkspacePlan(cwd, libraryRoot, targetPackIds, config, state);
    if (!plan.canApply) throw new WorkspacePlanBlocked(plan);
    if (plan.mcpRelevant) deps.ensureMcpAdapter?.();

    const targetPacks = resolveTargetPacks(config, plan.targetPackIds, state);
    const reconciliation = plan.mcpRelevant
      ? previewMcpReconciliation(cwd, libraryRoot, targetPacks, state)
      : null;
    if (reconciliation && !reconciliation.plan.canApply) throw new WorkspacePlanBlocked({ ...plan, mcp: reconciliation.plan, canApply: false });

    let copied: { created: string[]; installed: PreviewEntry[] } | null = null;
    let staged: StagedRemoval[] = [];
    let committedMcp = false;
    try {
      copied = copyPlanSkills(cwd, libraryRoot, plan, deps);
      staged = stageRemovedSkills(cwd, state, plan.targetPackIds, config);
      if (reconciliation) {
        commitMcpReconciliation(reconciliation);
        committedMcp = true;
      }
      const now = deps.now ?? nowFn;
      writeWorkspaceState(nextWorkspaceState(state, plan, config, now, reconciliation?.nextMcp ?? state.mcp), { cwd });
      discardRemovedSkills(staged);
      return { plan, installed: copied.installed };
    } catch (error) {
      if (committedMcp && reconciliation) restoreMcpReconciliation(reconciliation);
      for (const path of copied?.created ?? []) rmSync(path, { recursive: true, force: true });
      restoreRemovedSkills(staged);
      throw error;
    }
  });
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
