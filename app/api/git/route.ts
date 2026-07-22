import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getAllowedFileRoots, isFilePathAllowed, isWindowsAbsolutePath } from "@/lib/file-access";
import { parseGitBranches } from "@/lib/git-branches";

export const dynamic = "force-dynamic";

const GIT_TIMEOUT = 15_000;
const MAX_BUF = 2 * 1024 * 1024;

type Action = "stage" | "stage-all" | "unstage" | "unstage-all" | "discard" | "discard-all" | "commit" | "fetch" | "pull" | "push" | "set-remote";
type Body = { action?: unknown; cwd?: unknown; path?: unknown; message?: unknown; untracked?: unknown; remoteUrl?: unknown };
type Repository = { cwd: string; label: string };

class RequestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", ["-c", "core.quotepath=false", ...args], {
      cwd,
      timeout: GIT_TIMEOUT,
      encoding: "utf-8",
      maxBuffer: MAX_BUF,
    }, (error, stdout, stderr) => {
      if (!error) return resolve(stdout);
      reject(new RequestError(stderr.trim() || error.message));
    });
  });
}

function repoPath(value: unknown) {
  if (typeof value !== "string") throw new RequestError("path required");
  const normalized = value.trim().replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || isWindowsAbsolutePath(normalized)) {
    throw new RequestError("Invalid path");
  }
  if (normalized.split("/").some((part) => !part || part === "." || part === ".." || part === ".git")) {
    throw new RequestError("Invalid path");
  }
  return normalized;
}

function commitMessage(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new RequestError("Commit message required");
  const message = value.trim();
  if (message.length > 10_000) throw new RequestError("Commit message is too long");
  return message;
}

function remoteUrl(value: unknown) {
  if (typeof value !== "string") throw new RequestError("Remote URL required");
  const url = value.trim();
  if (!url || url.startsWith("-") || url.length > 2_048 || /[\x00-\x1f]/.test(url)) throw new RequestError("Invalid remote URL");
  return url;
}

function isAction(value: unknown): value is Action {
  return value === "stage" || value === "stage-all" || value === "unstage" || value === "unstage-all" || value === "discard" || value === "discard-all" || value === "commit" || value === "fetch" || value === "pull" || value === "push" || value === "set-remote";
}

const SKIPPED_DIRECTORIES = new Set([".git", ".next", "node_modules", "dist", "build", "coverage", "target", "vendor", "__pycache__"]);

function discoverRepositories(cwd: string): Repository[] {
  const repositories: Repository[] = [];
  const visited = new Set<string>();
  const visit = (directory: string, depth: number) => {
    if (visited.size >= 500 || depth > 4 || visited.has(directory)) return;
    visited.add(directory);
    try {
      if (fs.lstatSync(path.join(directory, ".git")).isDirectory() || fs.lstatSync(path.join(directory, ".git")).isFile()) {
        repositories.push({ cwd: directory, label: path.relative(cwd, directory) || "Workspace" });
      }
    } catch {
      // This directory is not a repository; its child folders may be.
    }
    try {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isDirectory() || SKIPPED_DIRECTORIES.has(entry.name)) continue;
        visit(path.join(directory, entry.name), depth + 1);
      }
    } catch {
      // Skip unreadable folders during discovery.
    }
  };
  visit(cwd, 0);
  return repositories.sort((left, right) => left.label.localeCompare(right.label));
}

async function checkedCwd(cwdValue: string | null) {
  if (!cwdValue?.trim()) throw new RequestError("cwd required");
  const cwd = path.resolve(cwdValue);
  const allowedRoots = await getAllowedFileRoots();
  if (!isFilePathAllowed(cwd, allowedRoots)) throw new RequestError("Access denied", 403);
  try {
    await git(["rev-parse", "--git-dir"], cwd);
  } catch {
    throw new RequestError("Not a Git repository");
  }
  return cwd;
}

export async function GET(request: NextRequest) {
  try {
    const action = request.nextUrl.searchParams.get("action");
    const cwdValue = request.nextUrl.searchParams.get("cwd");
    if (!cwdValue?.trim()) throw new RequestError("cwd required");
    const cwd = path.resolve(cwdValue);
    const allowedRoots = await getAllowedFileRoots();
    if (!isFilePathAllowed(cwd, allowedRoots)) throw new RequestError("Access denied", 403);
    if (action === "repositories") return NextResponse.json({ repositories: discoverRepositories(cwd) });
    try {
      await git(["rev-parse", "--git-dir"], cwd);
    } catch {
      return NextResponse.json({ notGit: true });
    }
    if (action === "branches") {
      const branches = parseGitBranches(await git(["for-each-ref", "--format=%(refname)%09%(HEAD)", "refs/heads", "refs/remotes"], cwd));
      return NextResponse.json({ branches });
    }
    if (action === "remote") {
      let url = "";
      try { url = (await git(["remote", "get-url", "origin"], cwd)).trim(); } catch { /* no origin remote */ }
      return NextResponse.json({ url });
    }
    throw new RequestError("Invalid action");
  } catch (error) {
    if (error instanceof RequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Body;
    if (!isAction(body.action)) throw new RequestError("Invalid action");
    if (typeof body.cwd !== "string") throw new RequestError("cwd required");
    const cwd = await checkedCwd(body.cwd);

    if (body.action === "stage") await git(["add", "--", repoPath(body.path)], cwd);
    if (body.action === "stage-all") await git(["add", "-A"], cwd);
    if (body.action === "unstage") await git(["restore", "--staged", "--", repoPath(body.path)], cwd);
    if (body.action === "unstage-all") await git(["restore", "--staged", ":/"], cwd);
    if (body.action === "discard") {
      const target = repoPath(body.path);
      await git(body.untracked === true ? ["clean", "-f", "--", target] : ["restore", "--worktree", "--", target], cwd);
    }
    if (body.action === "discard-all") {
      await git(["restore", "--worktree", "."], cwd);
      await git(["clean", "-fd"], cwd);
    }
    if (body.action === "commit") await git(["commit", "-m", commitMessage(body.message)], cwd);
    if (body.action === "fetch") await git(["fetch"], cwd);
    if (body.action === "pull") await git(["pull", "--ff-only"], cwd);
    if (body.action === "push") await git(["push"], cwd);
    if (body.action === "set-remote") {
      const url = remoteUrl(body.remoteUrl);
      const existing = (await git(["remote"], cwd)).split("\n").some((name) => name.trim() === "origin");
      await git(existing ? ["remote", "set-url", "origin", url] : ["remote", "add", "origin", url], cwd);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
