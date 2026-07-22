import { execFile } from "child_process";
import { NextRequest, NextResponse } from "next/server";
import { getAllowedFileRoots, isFilePathAllowed, isWindowsAbsolutePath } from "@/lib/file-access";
import { parseDiffSection } from "@/lib/git-diff-parse";

export const dynamic = "force-dynamic";

const GIT_TIMEOUT = 10_000;
const MAX_BUF = 2 * 1024 * 1024;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export type GitCommitSummary = {
  sha: string;
  shortSha: string;
  author: string;
  date: string;
  subject: string;
  refs: string[];
  parents: string[];
};

function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve) => {
    execFile("git", ["-c", "core.quotepath=false", ...args], {
      cwd,
      timeout: GIT_TIMEOUT,
      encoding: "utf-8",
      maxBuffer: MAX_BUF,
    }, (error, stdout) => resolve(error ? "" : stdout));
  });
}

function boundedNumber(value: string | null, fallback: number, maximum: number) {
  if (value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? Math.min(parsed, maximum) : fallback;
}

function repositoryPath(value: string) {
  const normalized = value.trim().replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || isWindowsAbsolutePath(normalized) || normalized.split("/").some((part) => !part || part === "." || part === "..")) return null;
  return normalized;
}

function parseCommits(raw: string): GitCommitSummary[] {
  return raw.split("\x1e").flatMap((record) => {
    const [sha, shortSha, author, date, refs, subject, parents] = record.trim().split("\x1f");
    if (!sha || !shortSha) return [];
    return [{
      sha,
      shortSha,
      author: author ?? "",
      date: date ?? "",
      subject: subject ?? "",
      refs: (refs ?? "").split(", ").filter(Boolean),
      parents: (parents ?? "").split(" ").filter(Boolean),
    }];
  });
}

export async function GET(request: NextRequest) {
  const cwd = request.nextUrl.searchParams.get("cwd")?.trim();
  if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });

  const allowedRoots = await getAllowedFileRoots();
  if (!isFilePathAllowed(cwd, allowedRoots)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }
  if (!(await git(["rev-parse", "--git-dir"], cwd))) {
    return NextResponse.json({ notGit: true, commits: [], hasMore: false });
  }

  const commit = request.nextUrl.searchParams.get("commit")?.trim() ?? "";
  if (commit) {
    if (!/^[0-9a-f]{7,64}$/i.test(commit)) {
      return NextResponse.json({ error: "Invalid commit" }, { status: 400 });
    }
    const sha = (await git(["rev-parse", "--verify", `${commit}^{commit}`], cwd)).trim();
    if (!sha) return NextResponse.json({ error: "Commit not found" }, { status: 404 });
    const parent = (await git(["rev-parse", "--verify", `${sha}^`], cwd)).trim();
    const filePath = request.nextUrl.searchParams.get("file");
    if (filePath) {
      const targetPath = repositoryPath(filePath);
      const sourcePath = repositoryPath(request.nextUrl.searchParams.get("source") ?? filePath);
      if (!targetPath || !sourcePath) return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
      const [oldContent, newContent] = await Promise.all([
        parent ? git(["show", `${parent}:${sourcePath}`], cwd) : Promise.resolve(""),
        git(["show", `${sha}:${targetPath}`], cwd),
      ]);
      return NextResponse.json({ oldContent, newContent });
    }
    const diffArgs = (format: "--name-status" | "--numstat") => parent
      ? ["diff", "--find-renames", "--find-copies", format, parent, sha]
      : ["diff-tree", "--root", "--no-commit-id", "--find-renames", "--find-copies", format, "-r", sha];
    const [summaryRaw, nameStatus, numstat] = await Promise.all([
      git(["show", "-s", "--format=%H%x1f%h%x1f%an%x1f%aI%x1f%D%x1f%s%x1f%P%x1e", sha], cwd),
      git(diffArgs("--name-status"), cwd),
      git(diffArgs("--numstat"), cwd),
    ]);
    const summary = parseCommits(summaryRaw)[0];
    if (!summary) return NextResponse.json({ error: "Commit not found" }, { status: 404 });
    return NextResponse.json({ commit: summary, files: parseDiffSection(nameStatus, numstat) });
  }

  const limit = boundedNumber(request.nextUrl.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
  const offset = boundedNumber(request.nextUrl.searchParams.get("offset"), 0, 10_000);
  const commits = parseCommits(await git([
    "log",
    `--max-count=${limit + 1}`,
    `--skip=${offset}`,
    "--date=iso-strict",
    "--decorate=short",
    "--format=%H%x1f%h%x1f%an%x1f%aI%x1f%D%x1f%s%x1f%P%x1e",
  ], cwd));
  return NextResponse.json({ commits: commits.slice(0, limit), hasMore: commits.length > limit });
}
