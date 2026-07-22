import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeConfigHash } from "./content-hash";
import { getLibraryMcpServer, type LibraryMcpServer, type McpPackReference, type McpServerDefinition } from "./mcp-library";
import type { SkillPack } from "./skill-packs-store";
import type { ManagedMcpServer, WorkspaceMcpState, WorkspaceState } from "./workspace-packs";

export type McpPreviewEntry = McpPackReference;

export interface McpSkippedEntry {
  serverKey: string;
  reason: "shadowed_by_team_config" | "same_name_exists_external" | "managed_entry_modified" | "disabled";
}

export interface McpBlockedEntry {
  serverKey: string;
  reason: "missing_in_library" | "hash_mismatch_in_library" | "invalid_pi_project_config" | "invalid_team_project_config";
}

export interface McpVersionConflict {
  serverKey: string;
  configHashes: string[];
  packIds: string[];
}

export interface McpPlan {
  toConfigure: McpPreviewEntry[];
  skipped: McpSkippedEntry[];
  blocked: McpBlockedEntry[];
  versionConflicts: McpVersionConflict[];
  canApply: boolean;
}

export interface McpReconciliation {
  plan: McpPlan;
  nextMcp: WorkspaceMcpState;
  projectPath: string;
  projectExisted: boolean;
  projectBefore: string | null;
  nextProjectConfig: Record<string, unknown> | null;
}

interface JsonConfig {
  existed: boolean;
  text: string | null;
  config: Record<string, unknown> | null;
}

interface DesiredServer {
  ref: McpPackReference;
  server: LibraryMcpServer;
}

interface CurrentServer {
  key: string;
  definition: unknown;
}

function projectPath(cwd: string): string {
  return join(cwd, ".pi", "mcp.json");
}

function teamPath(cwd: string): string {
  return join(cwd, ".mcp.json");
}

function lower(value: string): string {
  return value.toLowerCase();
}

function readJsonConfig(path: string): JsonConfig {
  if (!existsSync(path)) return { existed: false, text: null, config: {} };
  const text = readFileSync(path, "utf8");
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? { existed: true, text, config: parsed as Record<string, unknown> }
      : { existed: true, text, config: null };
  } catch {
    return { existed: true, text, config: null };
  }
}

function serverMap(config: Record<string, unknown>): Map<string, CurrentServer> | null {
  const servers = config.mcpServers;
  if (servers === undefined) return new Map();
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) return null;
  return new Map(Object.entries(servers as Record<string, unknown>).map(([key, definition]) => [lower(key), { key, definition }]));
}

export function unionMcpRefs(packs: SkillPack[]): { refs: McpPackReference[]; conflicts: McpVersionConflict[] } {
  const refs = new Map<string, McpPackReference>();
  const hashes = new Map<string, string[]>();
  const packIds = new Map<string, string[]>();
  for (const pack of packs) {
    for (const ref of pack.mcpServers ?? []) {
      const key = lower(ref.serverKey);
      if (!refs.has(key)) refs.set(key, ref);
      const seenHashes = hashes.get(key) ?? [];
      if (!seenHashes.includes(ref.configHash)) seenHashes.push(ref.configHash);
      hashes.set(key, seenHashes);
      packIds.set(key, [...(packIds.get(key) ?? []), pack.id]);
    }
  }
  return {
    refs: [...refs.values()],
    conflicts: [...refs.entries()].flatMap(([key, ref]) => {
      const configHashes = hashes.get(key)!;
      return configHashes.length > 1 ? [{ serverKey: ref.serverKey, configHashes, packIds: packIds.get(key)! }] : [];
    }),
  };
}

function equivalentMap(left: Record<string, ManagedMcpServer>, right: Record<string, ManagedMcpServer>): boolean {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  return leftEntries.length === rightEntries.length && leftEntries.every(([key, value]) => right[key]?.configHash === value.configHash);
}

/**
 * Compute the only allowed mutation of a workspace Pi MCP config. It never
 * takes ownership of an existing entry and drops ownership after manual edits.
 */
export function previewMcpReconciliation(
  cwd: string,
  libraryRoot: string,
  packs: SkillPack[],
  state: WorkspaceState,
): McpReconciliation {
  const { refs, conflicts } = unionMcpRefs(packs);
  const blocked: McpBlockedEntry[] = [];
  const desired = new Map<string, DesiredServer>();
  for (const ref of refs) {
    const server = getLibraryMcpServer(libraryRoot, ref.serverKey);
    if (!server) {
      blocked.push({ serverKey: ref.serverKey, reason: "missing_in_library" });
    } else if (server.configHash !== ref.configHash) {
      blocked.push({ serverKey: ref.serverKey, reason: "hash_mismatch_in_library" });
    } else {
      desired.set(lower(ref.serverKey), { ref, server });
    }
  }

  const projectFile = readJsonConfig(projectPath(cwd));
  const teamFile = readJsonConfig(teamPath(cwd));
  const projectServers = projectFile.config ? serverMap(projectFile.config) : null;
  const teamServers = teamFile.config ? serverMap(teamFile.config) : null;
  if (projectServers === null) blocked.push({ serverKey: "", reason: "invalid_pi_project_config" });
  if (teamServers === null) blocked.push({ serverKey: "", reason: "invalid_team_project_config" });

  const skipped: McpSkippedEntry[] = [];
  if (projectServers && teamServers) {
    for (const [key, entry] of desired) {
      if (teamServers.has(key)) {
        desired.delete(key);
        skipped.push({ serverKey: entry.ref.serverKey, reason: "shadowed_by_team_config" });
      }
    }
  }

  const canApply = blocked.length === 0 && conflicts.length === 0;
  if (!canApply || !projectFile.config || !projectServers) {
    return {
      plan: { toConfigure: [], skipped, blocked, versionConflicts: conflicts, canApply: false },
      nextMcp: state.mcp,
      projectPath: projectPath(cwd),
      projectExisted: projectFile.existed,
      projectBefore: projectFile.text,
      nextProjectConfig: null,
    };
  }

  const disabled = new Set(state.mcp.disabledServerKeys.map(lower));
  const currentManaged = new Map<string, CurrentServer>();
  const nextManaged: Record<string, ManagedMcpServer> = {};
  for (const [recordedKey, baseline] of Object.entries(state.mcp.managedServers)) {
    const current = projectServers.get(lower(recordedKey));
    if (!current) continue;
    if (computeConfigHash(current.definition) === baseline.configHash) {
      currentManaged.set(lower(recordedKey), current);
    } else {
      skipped.push({ serverKey: recordedKey, reason: "managed_entry_modified" });
    }
  }

  const nextServers: Record<string, unknown> = Object.fromEntries(
    [...projectServers.values()].map((server) => [server.key, server.definition]),
  );
  const toConfigure: McpPreviewEntry[] = [];

  for (const [key, desiredServer] of desired) {
    const managed = currentManaged.get(key);
    const current = projectServers.get(key);
    if (disabled.has(key)) {
      if (managed) delete nextServers[managed.key];
      if (!current || managed) nextManaged[desiredServer.ref.serverKey] = { configHash: desiredServer.ref.configHash };
      skipped.push({ serverKey: desiredServer.ref.serverKey, reason: "disabled" });
      continue;
    }
    if (managed) {
      nextServers[managed.key] = desiredServer.server.definition;
      nextManaged[desiredServer.ref.serverKey] = { configHash: desiredServer.ref.configHash };
      if (computeConfigHash(managed.definition) !== desiredServer.ref.configHash) toConfigure.push(desiredServer.ref);
      continue;
    }
    if (current) {
      skipped.push({ serverKey: desiredServer.ref.serverKey, reason: "same_name_exists_external" });
      continue;
    }
    nextServers[desiredServer.ref.serverKey] = desiredServer.server.definition;
    nextManaged[desiredServer.ref.serverKey] = { configHash: desiredServer.ref.configHash };
    toConfigure.push(desiredServer.ref);
  }

  for (const [key, managed] of currentManaged) {
    if (!desired.has(key) || disabled.has(key)) delete nextServers[managed.key];
  }

  const activeKeys = new Set(desired.keys());
  const nextDisabledServerKeys = state.mcp.disabledServerKeys.filter((key) => activeKeys.has(lower(key)));
  const nextMcp = { disabledServerKeys: nextDisabledServerKeys, managedServers: nextManaged };
  const nextProjectConfig = { ...projectFile.config, mcpServers: nextServers };
  const changedConfig = (projectFile.existed || desired.size > 0 || currentManaged.size > 0)
    && JSON.stringify(nextProjectConfig) !== JSON.stringify(projectFile.config);
  const changedOwnership = !equivalentMap(nextMcp.managedServers, state.mcp.managedServers)
    || nextMcp.disabledServerKeys.join("\0") !== state.mcp.disabledServerKeys.join("\0");

  return {
    plan: { toConfigure, skipped, blocked, versionConflicts: conflicts, canApply: true },
    nextMcp: changedOwnership ? nextMcp : state.mcp,
    projectPath: projectPath(cwd),
    projectExisted: projectFile.existed,
    projectBefore: projectFile.text,
    nextProjectConfig: changedConfig ? nextProjectConfig : null,
  };
}

export function commitMcpReconciliation(reconciliation: McpReconciliation): void {
  if (!reconciliation.nextProjectConfig) return;
  const dir = join(reconciliation.projectPath, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${reconciliation.projectPath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, `${JSON.stringify(reconciliation.nextProjectConfig, null, 2)}\n`, "utf8");
  renameSync(tmp, reconciliation.projectPath);
}

export function restoreMcpReconciliation(reconciliation: McpReconciliation): void {
  if (!reconciliation.nextProjectConfig) return;
  if (!reconciliation.projectExisted) {
    rmSync(reconciliation.projectPath, { force: true });
    return;
  }
  const dir = join(reconciliation.projectPath, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${reconciliation.projectPath}.tmp-restore-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, reconciliation.projectBefore ?? "", "utf8");
  renameSync(tmp, reconciliation.projectPath);
}

export function mcpDefinitionForPlan(entry: McpPreviewEntry, libraryRoot: string): McpServerDefinition | null {
  const server = getLibraryMcpServer(libraryRoot, entry.serverKey);
  return server?.configHash === entry.configHash ? server.definition : null;
}
