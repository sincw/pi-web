import { NextResponse } from "next/server";
import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { getLibrarySkill } from "@/lib/skill-library";
import { ensureLibraryRoot, readConfig } from "@/lib/skill-packs-store";

export const dynamic = "force-dynamic";

// POST /api/skills/install-from-library
// body: { cwd: string; skillKey: string }
// Copies a single skill from the configured library into the project.
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { cwd?: string; skillKey?: string };
    const cwd = body.cwd?.trim();
    const skillKey = body.skillKey?.trim();
    if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });
    if (!skillKey) return NextResponse.json({ error: "skillKey required" }, { status: 400 });

    const config = ensureLibraryRoot(readConfig());
    if (!config.libraryRoot) {
      return NextResponse.json({ error: "skill library not configured" }, { status: 400 });
    }

    const libSkill = getLibrarySkill(config.libraryRoot, skillKey);
    if (!libSkill) {
      return NextResponse.json({ error: `Skill "${skillKey}" not found in library` }, { status: 404 });
    }

    const projectSkillsDir = join(cwd, ".pi", "skills");
    if (!existsSync(projectSkillsDir)) mkdirSync(projectSkillsDir, { recursive: true });
    const dest = join(projectSkillsDir, skillKey);

    if (existsSync(dest)) {
      return NextResponse.json({ error: `Skill "${skillKey}" already exists in project` }, { status: 409 });
    }

    const tmp = `${dest}.tmp-${randomUUID()}`;
    cpSync(libSkill.baseDir, tmp, { recursive: true });
    renameSync(tmp, dest);

    return NextResponse.json({ success: true, skill: libSkill });
  } catch (e: unknown) {
    const err = e as { message?: string };
    return NextResponse.json({ error: err.message || String(e) }, { status: 500 });
  }
}
