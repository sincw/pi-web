import { NextResponse } from "next/server";
import { ensureLibraryRoot, getPackById, readConfig } from "@/lib/skill-packs-store";
import { readWorkspaceState } from "@/lib/workspace-packs";
import { unapplyPack } from "@/lib/skill-pack-apply";
import type { WorkspaceSkillPacksResponse } from "@/lib/api-types";

export const dynamic = "force-dynamic";

function readState(cwd: string): WorkspaceSkillPacksResponse {
  const config = ensureLibraryRoot(readConfig());
  const ws = readWorkspaceState({ cwd });
  return {
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
  if (!cwd || !packId) return NextResponse.json({ error: "cwd and packId required" }, { status: 400 });
  try {
    const config = ensureLibraryRoot(readConfig());
    const removed = unapplyPack(cwd, packId, config);
    if (!removed) return NextResponse.json({ error: "pack not applied" }, { status: 404 });
    return NextResponse.json(readState(cwd));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
