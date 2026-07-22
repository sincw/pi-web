import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { NextResponse } from "next/server";
import { getAllowedFileRoots, isFilePathAllowed } from "@/lib/file-access";
import { listTerminals } from "@/lib/terminal-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const requestedProject = new URL(req.url).searchParams.get("projectRoot");
    const projectRoot = requestedProject ? realpathSync(resolve(requestedProject)) : undefined;
    if (projectRoot && !isFilePathAllowed(projectRoot, await getAllowedFileRoots())) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    return NextResponse.json({ terminals: listTerminals(projectRoot) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
