import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getAllowedFileRoots, isFilePathAllowed } from "@/lib/file-access";

export const dynamic = "force-dynamic";

type Body = { action?: unknown; cwd?: unknown; path?: unknown; name?: unknown };

class RequestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function isWithin(root: string, target: string) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function relativePath(value: unknown, allowRoot = false) {
  if (typeof value !== "string") throw new RequestError("path required");
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!normalized && allowRoot) return "";
  if (!normalized || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new RequestError("Invalid path");
  }
  if (normalized.split("/").includes(".git")) throw new RequestError("Git metadata cannot be changed here");
  return normalized;
}

function entryName(value: unknown) {
  if (typeof value !== "string") throw new RequestError("name required");
  const name = value.trim();
  if (!name || name === "." || name === ".." || /[\\/]/.test(name)) throw new RequestError("Invalid name");
  if (name === ".git") throw new RequestError("Git metadata cannot be changed here");
  return name;
}

function workspacePath(cwd: string, relative: string, allowedRoots: Set<string>) {
  const root = path.resolve(cwd);
  const target = path.resolve(root, relative);
  if (!isWithin(root, target) || !isFilePathAllowed(target, allowedRoots)) throw new RequestError("Access denied", 403);
  return target;
}

function requireRealParentInsideWorkspace(cwd: string, target: string) {
  const realRoot = fs.realpathSync(cwd);
  const realParent = fs.realpathSync(path.dirname(target));
  if (!isWithin(realRoot, realParent)) throw new RequestError("Symlink escapes the workspace", 403);
}

function responseError(error: unknown) {
  if (error instanceof RequestError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error && typeof error === "object" && "code" in error) {
    const code = String(error.code);
    if (code === "EEXIST") return NextResponse.json({ error: "A file with that name already exists" }, { status: 409 });
    if (code === "ENOENT") return NextResponse.json({ error: "File not found" }, { status: 404 });
    if (code === "ENOTEMPTY") return NextResponse.json({ error: "Folder is not empty" }, { status: 409 });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Body;
    const action = body.action;
    if (action !== "create-file" && action !== "create-folder" && action !== "rename" && action !== "delete") {
      throw new RequestError("Invalid action");
    }
    if (typeof body.cwd !== "string" || !body.cwd.trim()) throw new RequestError("cwd required");
    const cwd = path.resolve(body.cwd);
    const allowedRoots = await getAllowedFileRoots();
    if (!isFilePathAllowed(cwd, allowedRoots)) throw new RequestError("Access denied", 403);
    if (!fs.statSync(cwd).isDirectory()) throw new RequestError("Workspace not found", 404);

    if (action === "create-file" || action === "create-folder") {
      const parent = relativePath(body.path, true);
      const target = workspacePath(cwd, parent ? `${parent}/${entryName(body.name)}` : entryName(body.name), allowedRoots);
      requireRealParentInsideWorkspace(cwd, target);
      if (action === "create-file") fs.writeFileSync(target, "", { flag: "wx" });
      else fs.mkdirSync(target);
      return NextResponse.json({ path: path.relative(cwd, target).replace(/\\/g, "/") });
    }

    const sourceRelative = relativePath(body.path);
    const source = workspacePath(cwd, sourceRelative, allowedRoots);
    requireRealParentInsideWorkspace(cwd, source);
    const stat = fs.lstatSync(source);
    if (action === "rename") {
      const target = workspacePath(cwd, path.posix.join(path.posix.dirname(sourceRelative), entryName(body.name)), allowedRoots);
      requireRealParentInsideWorkspace(cwd, target);
      fs.renameSync(source, target);
      return NextResponse.json({ path: path.relative(cwd, target).replace(/\\/g, "/") });
    }

    fs.rmSync(source, { recursive: stat.isDirectory() && !stat.isSymbolicLink() });
    return NextResponse.json({ path: sourceRelative });
  } catch (error) {
    return responseError(error);
  }
}
