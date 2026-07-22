import { NextResponse } from "next/server";
import { applyWorkspacePackChange, previewWorkspacePackChange, WorkspacePlanBlocked, WorkspaceRevisionConflict } from "@/lib/skill-pack-apply";
import { getMcpAdapterStatus, McpAdapterRequired, requireMcpAdapter } from "@/lib/mcp-adapter";
import { ensureLibraryRoot, readConfig } from "@/lib/skill-packs-store";

export const dynamic = "force-dynamic";

// POST /api/workspace-skill-packs/apply
// body: { cwd: string; packIds: string[]; workspaceRevision: number }
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      cwd?: string;
      packIds?: string[];
      workspaceRevision?: number;
    };
    const cwd = body.cwd?.trim();
    if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });
    const config = ensureLibraryRoot(readConfig());
    if (!config.libraryRoot) return NextResponse.json({ error: "skill library not configured" }, { status: 400 });
    const packIds = Array.isArray(body.packIds) ? body.packIds : [];
    if (packIds.length === 0 || typeof body.workspaceRevision !== "number" || !Number.isInteger(body.workspaceRevision)) {
      return NextResponse.json({ error: "packIds and workspaceRevision required" }, { status: 400 });
    }
    const preview = previewWorkspacePackChange(cwd, config.libraryRoot, packIds, config);
    if (preview.mcpRelevant) {
      const adapter = getMcpAdapterStatus(cwd);
      if (adapter.state !== "ready") {
        return NextResponse.json({ error: "MCP_ADAPTER_REQUIRED", adapter }, { status: 412 });
      }
    }
    const result = await applyWorkspacePackChange(cwd, config.libraryRoot, packIds, body.workspaceRevision, config, {
      ensureMcpAdapter: () => requireMcpAdapter(cwd),
    });
    return NextResponse.json({ success: true, installed: result.installed, skipped: result.plan.skipped, workspaceRevision: result.plan.workspaceRevision + 1 });
  } catch (e: unknown) {
    if (e instanceof McpAdapterRequired) {
      return NextResponse.json({ error: "MCP_ADAPTER_REQUIRED", adapter: e.adapter }, { status: 412 });
    }
    if (e instanceof WorkspaceRevisionConflict) {
      return NextResponse.json({ error: e.message, workspaceRevision: e.revision }, { status: 409 });
    }
    if (e instanceof WorkspacePlanBlocked) {
      return NextResponse.json({ error: e.message, plan: e.plan }, { status: 409 });
    }
    const err = e as { message?: string };
    return NextResponse.json({ error: err.message || String(e) }, { status: 500 });
  }
}
