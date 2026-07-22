import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { DefaultPackageManager, getAgentDir, SettingsManager, type PackageSource } from "@earendil-works/pi-coding-agent";

const ADAPTER_SOURCE = "npm:pi-mcp-adapter";

export interface McpAdapterStatus {
  state: "ready" | "missing" | "disabled";
  package: typeof ADAPTER_SOURCE;
  version?: string;
}

export class McpAdapterRequired extends Error {
  constructor(readonly adapter: McpAdapterStatus) {
    super("MCP_ADAPTER_REQUIRED");
  }
}

function sourceName(entry: PackageSource): string {
  return typeof entry === "string" ? entry : entry.source;
}

function disabled(entry: PackageSource): boolean {
  return typeof entry !== "string"
    && Array.isArray(entry.extensions) && entry.extensions.length === 0
    && Array.isArray(entry.skills) && entry.skills.length === 0
    && Array.isArray(entry.prompts) && entry.prompts.length === 0
    && Array.isArray(entry.themes) && entry.themes.length === 0;
}

function installedVersion(path?: string): string | undefined {
  if (!path) return undefined;
  try {
    const packagePath = statSync(path).isDirectory() ? join(path, "package.json") : join(dirname(path), "package.json");
    if (!existsSync(packagePath)) return undefined;
    const value = JSON.parse(readFileSync(packagePath, "utf8")) as { version?: unknown };
    return typeof value.version === "string" ? value.version : undefined;
  } catch {
    return undefined;
  }
}

export function getMcpAdapterStatus(cwd: string): McpAdapterStatus {
  const settingsManager = SettingsManager.create(cwd, getAgentDir());
  const entries = [
    ...(settingsManager.getGlobalSettings().packages ?? []).map((entry) => ({ entry, scope: "user" as const })),
    ...(settingsManager.getProjectSettings().packages ?? []).map((entry) => ({ entry, scope: "project" as const })),
  ].filter(({ entry }) => sourceName(entry) === ADAPTER_SOURCE);
  if (entries.length === 0) return { state: "missing", package: ADAPTER_SOURCE };
  const enabled = entries.filter(({ entry }) => !disabled(entry));
  if (enabled.length === 0) return { state: "disabled", package: ADAPTER_SOURCE };

  const manager = new DefaultPackageManager({ cwd, agentDir: getAgentDir(), settingsManager });
  const configured = manager.listConfiguredPackages().find((item) =>
    item.source === ADAPTER_SOURCE
    && enabled.some(({ scope }) => scope === item.scope)
    && item.installedPath,
  );
  if (!configured) return { state: "missing", package: ADAPTER_SOURCE };
  return { state: "ready", package: ADAPTER_SOURCE, version: installedVersion(configured?.installedPath) };
}

export function requireMcpAdapter(cwd: string): void {
  const adapter = getMcpAdapterStatus(cwd);
  if (adapter.state !== "ready") throw new McpAdapterRequired(adapter);
}
