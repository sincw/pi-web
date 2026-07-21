import { NextResponse } from "next/server";
import { applyPlan, preview } from "@/lib/skill-pack-apply";
import { ensureLibraryRoot, readConfig } from "@/lib/skill-packs-store";
import type { ApplyPreviewResponse } from "@/lib/api-types";

export const dynamic = "force-dynamic";

function isPlan(value: unknown): value is ApplyPreviewResponse {
  const p = value as ApplyPreviewResponse;
  return (
    typeof p === "object" &&
    p !== null &&
    typeof p.canApply === "boolean" &&
    Array.isArray(p.toInstall) &&
    Array.isArray(p.skipped) &&
    Array.isArray(p.blocked) &&
    Array.isArray(p.versionConflicts) &&
    Array.isArray(p.packs)
  );
}

// POST /api/workspace-skill-packs/apply
// body: { cwd: string; plan: ApplyPreviewResponse }
// The client must pass back the exact preview it confirmed. If no plan is
// supplied, the server recomputes one as a fallback.
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      cwd?: string;
      plan?: ApplyPreviewResponse;
      packIds?: string[];
    };
    const cwd = body.cwd?.trim();
    if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });
    const config = ensureLibraryRoot(readConfig());
    if (!config.libraryRoot) return NextResponse.json({ error: "skill library not configured" }, { status: 400 });

    let plan: ReturnType<typeof preview>;
    if (body.plan && isPlan(body.plan)) {
      plan = body.plan;
    } else {
      const packIds = Array.isArray(body.packIds) ? body.packIds : [];
      if (packIds.length === 0) return NextResponse.json({ error: "packIds or plan required" }, { status: 400 });
      plan = preview(cwd, config.libraryRoot, packIds, config);
    }

    if (!plan.canApply) {
      return NextResponse.json({ error: "Plan cannot be applied", plan }, { status: 409 });
    }
    const result = applyPlan(cwd, config.libraryRoot, plan);
    return NextResponse.json({ success: true, installed: result.installed, skipped: result.skipped });
  } catch (e: unknown) {
    const err = e as { message?: string };
    return NextResponse.json({ error: err.message || String(e) }, { status: 500 });
  }
}
