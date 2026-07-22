import { realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { NextResponse } from "next/server";
import { getAllowedFileRoots, isFilePathAllowed } from "@/lib/file-access";
import { closeTerminal, getTerminalHistory, isTerminalId, resizeTerminal, startTerminal, writeTerminal } from "@/lib/terminal-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TerminalBody = { cwd?: unknown; projectRoot?: unknown; title?: unknown; data?: unknown; cols?: unknown; rows?: unknown };

function responseError(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
}

async function checkedCwd(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new Error("cwd is required");
  const cwd = realpathSync(resolve(value));
  if (!statSync(cwd).isDirectory()) throw new Error("Workspace not found");
  const roots = await getAllowedFileRoots();
  const realRoots = new Set<string>();
  for (const root of roots) {
    try {
      realRoots.add(realpathSync(root));
    } catch {
      // A stale session root does not authorize a terminal.
    }
  }
  if (!isFilePathAllowed(cwd, realRoots)) throw new Error("Access denied");
  return cwd;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isTerminalId(id)) return NextResponse.json({ error: "Invalid terminal id" }, { status: 400 });
  try {
    const body = await req.json() as TerminalBody;
    const cwd = await checkedCwd(body.cwd);
    const projectRoot = await checkedCwd(body.projectRoot ?? cwd);
    const title = typeof body.title === "string" && body.title.trim().length <= 100 ? body.title.trim() : "终端";
    const session = startTerminal(id, cwd, projectRoot, title, body.cols, body.rows);
    if (!session) return NextResponse.json({ error: "Terminal was closed" }, { status: 410 });
    return NextResponse.json({ running: session.running, cwd: session.cwd, projectRoot: session.projectRoot, title: session.title, history: getTerminalHistory(id) });
  } catch (error) {
    return responseError(error);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isTerminalId(id)) return NextResponse.json({ error: "Invalid terminal id" }, { status: 400 });
  try {
    const body = await req.json() as TerminalBody;
    if (body.data !== undefined) {
      const result = writeTerminal(id, body.data);
      if (result === "missing") return NextResponse.json({ error: "Terminal not found" }, { status: 404 });
      if (result === "closed") return NextResponse.json({ error: "Terminal has exited" }, { status: 409 });
      if (result === "invalid") return NextResponse.json({ error: "Invalid terminal input" }, { status: 400 });
    }
    if (body.cols !== undefined || body.rows !== undefined) {
      if (!resizeTerminal(id, body.cols, body.rows)) return NextResponse.json({ error: "Terminal not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, history: getTerminalHistory(id) });
  } catch (error) {
    return responseError(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isTerminalId(id)) return NextResponse.json({ error: "Invalid terminal id" }, { status: 400 });
  return NextResponse.json({ ok: closeTerminal(id) });
}
