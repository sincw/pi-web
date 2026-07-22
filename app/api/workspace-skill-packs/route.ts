import { NextResponse } from "next/server";
import { ensureLibraryRoot, getPackById, readConfig } from "@/lib/skill-packs-store";
import { readWorkspaceState } from "@/lib/workspace-packs";
import { applyWorkspacePackChange, previewWorkspacePackChange, WorkspacePlanBlocked, WorkspaceRevisionConflict } from "@/lib/skill-pack-apply";
import { getMcpAdapterStatus, McpAdapterRequired, requireMcpAdapter } from "@/lib/mcp-adapter";
import type { WorkspaceSkillPacksResponse } from "@/lib/api-types";

export const dynamic = "force-dynamic";

function readState(cwd: string): WorkspaceSkillPacksResponse {
  const config = ensureLibraryRoot(readConfig());
  const ws = readWorkspaceState({ cwd });
  return {
    revision: ws.revision,
    appliedPacks: ws.appliedPacks.map((p) => ({
      ...p,
      packName: getPackById(config, p.packId)?.name ?? p.packId,
    })),
    skippedConflicts: ws.skippedConflicts,
  };
}

// GET /api/workspace-skill-packs?cwd=<path>
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cwd = searchParams.get("cwd");
  if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });
  try {
    return NextResponse.json(readState(cwd));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE /api/workspace-skill-packs?cwd=<path>&packId=<id>
// Removes the pack label and deletes skills it installed that are no longer
// required by remaining applied packs.
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const cwd = searchParams.get("cwd");
  const packId = searchParams.get("packId");
  const workspaceRevision = Number(searchParams.get("workspaceRevision"));
  if (!cwd || !packId || !Number.isInteger(workspaceRevision)) {
    return NextResponse.json({ error: "cwd, packId, and workspaceRevision required" }, { status: 400 });
  }
  try {
    const config = ensureLibraryRoot(readConfig());
    if (!config.libraryRoot) return NextResponse.json({ error: "skill library not configured" }, { status: 400 });
    const state = readWorkspaceState({ cwd });
    if (!state.appliedPacks.some((pack) => pack.packId === packId)) return NextResponse.json({ error: "pack not applied" }, { status: 404 });
    const targetPackIds = state.appliedPacks.filter((pack) => pack.packId !== packId).map((pack) => pack.packId);
    const preview = previewWorkspacePackChange(cwd, config.libraryRoot, targetPackIds, config);
    if (preview.mcpRelevant) {
      const adapter = getMcpAdapterStatus(cwd);
      if (adapter.state !== "ready") return NextResponse.json({ error: "MCP_ADAPTER_REQUIRED", adapter }, { status: 412 });
    }
    await applyWorkspacePackChange(cwd, config.libraryRoot, targetPackIds, workspaceRevision, config, {
      ensureMcpAdapter: () => requireMcpAdapter(cwd),
    });
    return NextResponse.json(readState(cwd));
  } catch (e) {
    if (e instanceof McpAdapterRequired) return NextResponse.json({ error: "MCP_ADAPTER_REQUIRED", adapter: e.adapter }, { status: 412 });
    if (e instanceof WorkspaceRevisionConflict) return NextResponse.json({ error: e.message, workspaceRevision: e.revision }, { status: 409 });
    if (e instanceof WorkspacePlanBlocked) return NextResponse.json({ error: e.message, plan: e.plan }, { status: 409 });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
