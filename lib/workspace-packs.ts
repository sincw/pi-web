import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SkillRef, SkillPack } from "./skill-packs-store";
import type { McpPackReference } from "./mcp-library";

export type PackStatus = "full" | "partial";

export interface Receipt {
  appliedAt: string;
  installed: SkillRef[];
  mcpServers: McpPackReference[];
}

export interface AppliedPack {
  packId: string;
  status: PackStatus;
  receipt: Receipt;
}

export interface SkippedConflict {
  packId: string;
  skillKey?: string;
  serverKey?: string;
  reason: string;
}

export interface ManagedMcpServer {
  configHash: string;
}

export interface WorkspaceMcpState {
  disabledServerKeys: string[];
  managedServers: Record<string, ManagedMcpServer>;
}

export interface WorkspaceState {
  version: 2;
  revision: number;
  appliedPacks: AppliedPack[];
  skippedConflicts: SkippedConflict[];
  mcp: WorkspaceMcpState;
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
  return { version: 2, revision: 0, appliedPacks: [], skippedConflicts: [], mcp: { disabledServerKeys: [], managedServers: {} } };
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
      version: 2,
      revision: Number.isInteger(parsed.revision) && (parsed.revision ?? 0) >= 0 ? parsed.revision! : 0,
      appliedPacks: Array.isArray(parsed.appliedPacks) ? parsed.appliedPacks.map(normalizeApplied) : [],
      skippedConflicts: Array.isArray(parsed.skippedConflicts) ? parsed.skippedConflicts.map(normalizeSkipped) : [],
      mcp: normalizeMcp(parsed.mcp),
    };
  } catch {
    return emptyState();
  }
}

function normalizeApplied(p: unknown): AppliedPack {
  const raw = p as Partial<AppliedPack>;
  const receipt = raw.receipt ?? { appliedAt: "", installed: [], mcpServers: [] };
  return {
    packId: typeof raw.packId === "string" ? raw.packId : "",
    status: raw.status === "partial" ? "partial" : "full",
    receipt: {
      appliedAt: typeof receipt.appliedAt === "string" ? receipt.appliedAt : "",
      installed: Array.isArray(receipt.installed) ? receipt.installed : [],
      mcpServers: Array.isArray(receipt.mcpServers) ? receipt.mcpServers.map(normalizeMcpRef) : [],
    },
  };
}

function normalizeMcpRef(value: unknown): McpPackReference {
  const raw = value as Partial<McpPackReference>;
  return {
    serverKey: typeof raw.serverKey === "string" ? raw.serverKey : "",
    configHash: typeof raw.configHash === "string" ? raw.configHash : "",
  };
}

function normalizeSkipped(s: unknown): SkippedConflict {
  const raw = s as Partial<SkippedConflict>;
  const skillKey = typeof raw.skillKey === "string" ? raw.skillKey : undefined;
  const serverKey = typeof raw.serverKey === "string" ? raw.serverKey : undefined;
  return {
    packId: typeof raw.packId === "string" ? raw.packId : "",
    ...(skillKey === undefined ? {} : { skillKey }),
    ...(serverKey === undefined ? {} : { serverKey }),
    reason: typeof raw.reason === "string" ? raw.reason : "",
  };
}

function normalizeMcp(value: unknown): WorkspaceMcpState {
  const raw = value as Partial<WorkspaceMcpState> | undefined;
  const managed = raw?.managedServers && typeof raw.managedServers === "object" && !Array.isArray(raw.managedServers)
    ? Object.fromEntries(Object.entries(raw.managedServers).flatMap(([key, entry]) => {
      const hash = (entry as Partial<ManagedMcpServer>)?.configHash;
      return typeof hash === "string" ? [[key, { configHash: hash }]] : [];
    }))
    : {};
  return {
    disabledServerKeys: Array.isArray(raw?.disabledServerKeys)
      ? raw.disabledServerKeys.filter((key): key is string => typeof key === "string")
      : [],
    managedServers: managed,
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
    version: 2,
    revision: state.revision,
    appliedPacks: [...others, applied],
    skippedConflicts: [...otherConflicts, ...conflicts],
    mcp: state.mcp,
  };
}

/**
 * Remove a pack tag from the workspace state (pure). Only state is mutated —
 * project skill files are never touched by tag removal.
 */
export function removeAppliedPack(state: WorkspaceState, packId: string): WorkspaceState {
  return {
    version: 2,
    revision: state.revision,
    appliedPacks: state.appliedPacks.filter((p) => p.packId !== packId),
    skippedConflicts: state.skippedConflicts.filter((c) => c.packId !== packId),
    mcp: state.mcp,
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
