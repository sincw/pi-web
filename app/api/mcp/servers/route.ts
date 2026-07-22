import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { readWorkspaceState } from "@/lib/workspace-packs";
import type { WorkspaceMcpServerInfo } from "@/lib/api-types";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readServerFile(
  path: string,
  source: WorkspaceMcpServerInfo["source"],
  managed: Set<string>,
): WorkspaceMcpServerInfo[] {
  if (!existsSync(path)) return [];
  const config = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!isRecord(config) || (config.mcpServers !== undefined && !isRecord(config.mcpServers))) {
    throw new Error("workspace MCP configuration is invalid");
  }
  return Object.entries((config.mcpServers as Record<string, unknown> | undefined) ?? {}).flatMap(([serverKey, definition]) =>
    isRecord(definition) ? [{ serverKey, definition, source, managedByPack: source === "pi-project" && managed.has(serverKey.toLowerCase()) }] : [],
  );
}

function readServers(cwd: string): WorkspaceMcpServerInfo[] {
  const managed = new Set(Object.keys(readWorkspaceState({ cwd }).mcp.managedServers).map((key) => key.toLowerCase()));
  return [
    ...readServerFile(join(cwd, ".mcp.json"), "team-project", managed),
    ...readServerFile(join(cwd, ".pi", "mcp.json"), "pi-project", managed),
  ];
}

// GET /api/mcp/servers?cwd=<path>
export async function GET(req: Request) {
  const cwd = new URL(req.url).searchParams.get("cwd");
  if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });
  try {
    return NextResponse.json({ servers: readServers(cwd) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
