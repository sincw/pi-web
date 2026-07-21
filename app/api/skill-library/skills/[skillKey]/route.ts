import { NextResponse } from "next/server";
import { deleteLibrarySkill, getLibrarySkill } from "@/lib/skill-library";
import { findPacksReferencingSkillKey, readConfig } from "@/lib/skill-packs-store";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ skillKey: string }>;
}

// GET /api/skill-library/skills/:skillKey
export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const { skillKey } = await params;
    const config = readConfig();
    if (!config.libraryRoot) {
      return NextResponse.json({ error: "library not configured" }, { status: 404 });
    }
    const skill = getLibrarySkill(config.libraryRoot, skillKey);
    if (!skill) return NextResponse.json({ error: "skill not found" }, { status: 404 });
    return NextResponse.json(skill);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE /api/skill-library/skills/:skillKey
export async function DELETE(_req: Request, { params }: RouteParams) {
  try {
    const { skillKey } = await params;
    const config = readConfig();
    if (!config.libraryRoot) {
      return NextResponse.json({ error: "library not configured" }, { status: 404 });
    }
    const referencedBy = findPacksReferencingSkillKey(config, skillKey);
    const result = deleteLibrarySkill(config.libraryRoot, skillKey, referencedBy);
    if (!result.ok) {
      return NextResponse.json(result, { status: 409 });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
