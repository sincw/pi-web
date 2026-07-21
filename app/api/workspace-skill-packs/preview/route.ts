import { NextResponse } from "next/server";
import { preview } from "@/lib/skill-pack-apply";
import { ensureLibraryRoot, readConfig } from "@/lib/skill-packs-store";
import type { ApplyPreviewResponse } from "@/lib/api-types";

export const dynamic = "force-dynamic";

// POST /api/workspace-skill-packs/preview
// body: { cwd: string; packIds: string[] }
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { cwd?: string; packIds?: string[] };
    const cwd = body.cwd?.trim();
    const packIds = Array.isArray(body.packIds) ? body.packIds : [];
    if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });
    if (packIds.length === 0) return NextResponse.json({ error: "packIds required" }, { status: 400 });
    const config = ensureLibraryRoot(readConfig());
    if (!config.libraryRoot) return NextResponse.json({ error: "skill library not configured" }, { status: 400 });
    const plan = preview(cwd, config.libraryRoot, packIds, config);
    return NextResponse.json(plan as ApplyPreviewResponse);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
