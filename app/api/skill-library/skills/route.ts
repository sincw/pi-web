import { NextResponse } from "next/server";
import { scanLibrary } from "@/lib/skill-library";
import { readConfig } from "@/lib/skill-packs-store";

export const dynamic = "force-dynamic";

// GET /api/skill-library/skills
// Lists every skill copy in the configured library.
export async function GET() {
  const config = readConfig();
  const skills = config.libraryRoot ? scanLibrary(config.libraryRoot) : [];
  return NextResponse.json({ skills });
}