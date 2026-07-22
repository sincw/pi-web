import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { getAllowedFileRoots, isFilePathAllowed, isWindowsAbsolutePath } from "@/lib/file-access";
import { parseDiffSection, parseUntracked, type DiffSection } from "@/lib/git-diff-parse";

export const dynamic = "force-dynamic";

const GIT_TIMEOUT = 10_000;
const MAX_BUF = 1024 * 1024;
// Cap for the unstaged "new" side read straight from the worktree. /api/files
// caps previews at 256KB; we raise it for diffs (one big file is the common
// case, e.g. package-lock.json ~600KB) but still stop short of multi-MB
// generated files, where the browser's O(n²) diff would lock up the tab.
const MAX_READ_BYTES = 4 * 1024 * 1024;

// Run a git command in cwd, resolving to stdout or "" on failure. execFile
// (argv array) never spawns a shell, so file paths from the client are passed
// as a single argv element and can't inject shell metacharacters. Async so
// the Node event loop isn't blocked while git runs — a stuck git process can't
// stall other in-flight requests. -c core.quotepath=false keeps non-ASCII
// paths (e.g. Chinese) as UTF-8 instead of octal-escaping them; without it a
// path like "测试指导文档.md" comes back quoted-escaped and `git show` + the
// worktree read both miss it → blank diff.
function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve) => {
    execFile("git", ["-c", "core.quotepath=false", ...args], {
      cwd,
      timeout: GIT_TIMEOUT,
      encoding: "utf-8",
      maxBuffer: MAX_BUF,
    }, (err, stdout) => {
      resolve(err ? "" : stdout);
    });
  });
}

function repositoryPath(value: string) {
  const normalized = value.trim().replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || isWindowsAbsolutePath(normalized) || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    return null;
  }
  return normalized;
}

export async function GET(request: NextRequest) {
  const cwd = request.nextUrl.searchParams.get("cwd");
  if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });

  const allowedRoots = await getAllowedFileRoots();
  if (!isFilePathAllowed(cwd, allowedRoots)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Not a git repo at all → distinct from "no changes".
  if (!(await git(["rev-parse", "--git-dir"], cwd))) {
    return NextResponse.json({ notGit: true, staged: [], unstaged: [] });
  }

  const filePath = request.nextUrl.searchParams.get("file");
  const sectionParam = request.nextUrl.searchParams.get("section");
  const section: DiffSection = sectionParam === "staged" || sectionParam === "branch" ? sectionParam : "unstaged";
  // For renames (status R) the dest path may not exist on the baseline side;
  // the source path does. Caller passes `source` for R entries.
  const source = request.nextUrl.searchParams.get("source");

  // File mode: return the content for both sides of a per-file diff.
  if (filePath) {
    const targetPath = repositoryPath(filePath);
    const baselinePath = repositoryPath(source ?? filePath);
    if (!targetPath || !baselinePath) return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    if (section === "branch") {
      const base = (await git(["merge-base", "@{upstream}", "HEAD"], cwd)).trim();
      if (!base) return NextResponse.json({ error: "This branch has no upstream to compare against" }, { status: 409 });
      const [oldContent, newContent] = await Promise.all([
        git(["show", `${base}:${baselinePath}`], cwd),
        git(["show", `HEAD:${targetPath}`], cwd),
      ]);
      return NextResponse.json({ oldContent, newContent, baseRef: base });
    }
    // Staged diff = index vs HEAD:  old = HEAD:baseline  new = :filePath
    // Unstaged diff = worktree vs index: old = :baseline  new = worktree file
    // A missing side reads as "" (untracked / deleted / new file).
    if (section === "staged") {
      const [oldContent, newContent] = await Promise.all([
        git(["show", `HEAD:${baselinePath}`], cwd),
        git(["show", `:${targetPath}`], cwd),
      ]);
      return NextResponse.json({ oldContent, newContent });
    }
    // For unstaged, the worktree side is read directly so /api/files' 256KB
    // preview cap doesn't blank out large files (e.g. package-lock.json).
    // Cap it ourselves — past a few MB the browser diff would lock up.
    let newContent = "";
    const fullPath = path.join(cwd, targetPath);
    try {
      const st = fs.statSync(fullPath);
      if (st.size <= MAX_READ_BYTES) {
        newContent = fs.readFileSync(fullPath, "utf-8");
      } else {
        const msg = `File too large for inline diff (${Math.round(st.size / 1024)}KB)`;
        return NextResponse.json({ error: msg });
      }
    } catch {
      // Deleted file (or unreadable): right side empty → pure-deletion diff.
      newContent = "";
    }
    const oldContent = await git(["show", `:${baselinePath}`], cwd);
    return NextResponse.json({ oldContent, newContent });
  }

  // List mode: two sections, mirroring VS Code's Source Control. All five
  // spawns are independent → one concurrent round, not five serial ones.
  if (request.nextUrl.searchParams.get("compare") === "upstream") {
    const base = (await git(["merge-base", "@{upstream}", "HEAD"], cwd)).trim();
    if (!base) return NextResponse.json({ error: "This branch has no upstream to compare against" }, { status: 409 });
    const [nameStatus, numstat, upstream] = await Promise.all([
      git(["diff", "--name-status", `${base}...HEAD`], cwd),
      git(["diff", "--numstat", `${base}...HEAD`], cwd),
      git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], cwd),
    ]);
    return NextResponse.json({ branchChanges: parseDiffSection(nameStatus, numstat), baseRef: upstream.trim() || base });
  }

  const [stagedNs, stagedNum, unstagedNs, unstagedNum, untrackedRaw, branch, upstream, divergence] = await Promise.all([
    git(["diff", "--cached", "--name-status"], cwd),
    git(["diff", "--cached", "--numstat"], cwd),
    git(["diff", "--name-status"], cwd),
    git(["diff", "--numstat"], cwd),
    git(["ls-files", "--others", "--exclude-standard"], cwd),
    git(["branch", "--show-current"], cwd),
    git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], cwd),
    git(["rev-list", "--left-right", "--count", "@{upstream}...HEAD"], cwd),
  ]);
  const staged = parseDiffSection(stagedNs, stagedNum);
  const unstagedTracked = parseDiffSection(unstagedNs, unstagedNum);
  const untracked = parseUntracked(untrackedRaw);
  const [behind = "0", ahead = "0"] = divergence.trim().split(/\s+/);

  return NextResponse.json({
    staged,
    unstaged: [...unstagedTracked, ...untracked].sort((a, b) => a.path.localeCompare(b.path)),
    branch: branch.trim() || "HEAD",
    upstream: upstream.trim(),
    ahead: Number(ahead) || 0,
    behind: Number(behind) || 0,
  });
}
