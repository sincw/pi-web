import { NextResponse } from "next/server";
import { getLibrarySkill } from "@/lib/skill-library";
import {
  deletePack,
  ensureLibraryRoot,
  getPackById,
  readConfig,
  updatePack,
  writeConfig,
  type SkillRef,
} from "@/lib/skill-packs-store";
import type { LibrarySkillInfo, SkillPackDetail, SkillPackInfo } from "@/lib/api-types";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function toInfo(pack: { id: string; name: string; description: string; skills: SkillRef[] }): SkillPackInfo {
  return { id: pack.id, name: pack.name, description: pack.description, skillCount: pack.skills.length };
}

function buildDetail(packId: string): SkillPackDetail | null {
  const config = ensureLibraryRoot(readConfig());
  const pack = getPackById(config, packId);
  if (!pack) return null;
  const skills: LibrarySkillInfo[] = [];
  if (config.libraryRoot) {
    for (const ref of pack.skills) {
      const lib = getLibrarySkill(config.libraryRoot, ref.skillKey);
      if (lib) {
        skills.push(lib);
      } else {
        skills.push({
          skillKey: ref.skillKey,
          name: ref.skillKey,
          description: "",
          baseDir: "",
          filePath: "",
          contentHash: ref.contentHash,
        });
      }
    }
  }
  return { id: pack.id, name: pack.name, description: pack.description, skills };
}

// GET /api/skill-packs/:id
export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const detail = buildDetail(id);
    if (!detail) return NextResponse.json({ error: "pack not found" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PATCH /api/skill-packs/:id
export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      name?: string;
      description?: string;
      skills?: SkillRef[];
    };
    const config = readConfig();
    if (!getPackById(config, id)) {
      return NextResponse.json({ error: "pack not found" }, { status: 404 });
    }
    const patch: { name?: string; description?: string; skills?: SkillRef[] } = {};
    if (typeof body.name === "string") patch.name = body.name.trim();
    if (typeof body.description === "string") patch.description = body.description.trim();
    if (Array.isArray(body.skills)) patch.skills = body.skills;
    const next = updatePack(config, id, patch);
    writeConfig(next);
    const updated = getPackById(next, id)!;
    return NextResponse.json({ pack: toInfo(updated) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE /api/skill-packs/:id
export async function DELETE(_req: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const config = readConfig();
    if (!getPackById(config, id)) {
      return NextResponse.json({ error: "pack not found" }, { status: 404 });
    }
    const next = deletePack(config, id);
    writeConfig(next);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
