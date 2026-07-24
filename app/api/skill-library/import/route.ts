import { NextResponse } from "next/server";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runNpx } from "@/lib/npx";
import { scanLibrary, discoverSkillDir, writeLibrarySkill, getLibrarySkillsDir } from "@/lib/skill-library";
import { readConfig } from "@/lib/skill-packs-store";
import { getAllowedFileRoots, isFilePathAllowed, allowFileRoot } from "@/lib/file-access";

export const dynamic = "force-dynamic";

const ANSI_RE = /\x1B\[[0-9;]*m/g;

function getLibraryRoot(): string {
  const config = readConfig();
  if (!config.libraryRoot) throw new Error("Skill library not configured");
  return config.libraryRoot;
}

async function marketImport(pkg: string) {
  const libraryRoot = getLibraryRoot();
  const before = new Set(scanLibrary(libraryRoot).map((s) => s.skillKey.toLowerCase()));
  const args = ["skills", "add", pkg.trim(), "-y", "--agent", "pi"];
  const { stdout, stderr } = await runNpx(args, {
    timeout: 120000,
    cwd: libraryRoot,
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  const output = (stdout + stderr).replace(ANSI_RE, "");
  const success = /Installation complete|Installed \d+ skill/.test(output);
  if (!success) throw new Error(output.slice(-300) || "Install failed");
  const after = scanLibrary(libraryRoot);
  const expectedRoot = getLibrarySkillsDir(libraryRoot);
  for (const skill of after) {
    if (!skill.baseDir.startsWith(expectedRoot)) {
      throw new Error(`Installed skill escaped the library root: ${skill.baseDir}`);
    }
  }
  const added = after.filter((s) => !before.has(s.skillKey.toLowerCase()));
  return { skills: after, added };
}

async function localImport(sourcePath: string, targetKey?: string) {
  const libraryRoot = getLibraryRoot();
  const allowed = await getAllowedFileRoots();
  if (!isFilePathAllowed(sourcePath, allowed)) {
    throw new Error("Selected path is not within an allowed file root");
  }
  allowFileRoot(sourcePath);
  const discovered = discoverSkillDir(sourcePath);
  const skillKey = targetKey?.trim() || discovered.skillKey;
  const written = writeLibrarySkill(libraryRoot, skillKey, sourcePath);
  return { skill: written };
}

interface GitImportBody {
  source: "git";
  url: string;
  selectedKeys?: string[];
}

async function gitImport(body: GitImportBody) {
  const libraryRoot = getLibraryRoot();
  const tmpDir = mkdtempSync(join(tmpdir(), "pivot-ui-git-import-"));
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    await execFileAsync("git", ["clone", "--depth", "1", body.url, tmpDir], { timeout: 60000 });
    const { discoverSkillsRecursive } = await import("@/lib/skill-library");
    const all = discoverSkillsRecursive(tmpDir);
    const selected = body.selectedKeys?.length
      ? all.filter((s) => body.selectedKeys!.includes(s.skillKey))
      : all;
    const written: Awaited<ReturnType<typeof writeLibrarySkill>>[] = [];
    for (const s of selected) {
      written.push(writeLibrarySkill(libraryRoot, s.skillKey, s.sourceDir));
    }
    return { discovered: all, imported: written };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// POST /api/skill-library/import
// body: { source: "market", package: string } |
//       { source: "local", path: string, targetKey?: string } |
//       { source: "git", url: string, selectedKeys?: string[] }
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { source?: string } & Record<string, unknown>;
    const source = body.source;
    if (source === "market") {
      const pkg = typeof body.package === "string" ? body.package : "";
      if (!pkg.trim()) return NextResponse.json({ error: "package required" }, { status: 400 });
      const result = await marketImport(pkg);
      return NextResponse.json(result);
    }
    if (source === "local") {
      const path = typeof body.path === "string" ? body.path : "";
      const targetKey = typeof body.targetKey === "string" ? body.targetKey : undefined;
      if (!path.trim()) return NextResponse.json({ error: "path required" }, { status: 400 });
      const result = await localImport(path, targetKey);
      return NextResponse.json(result);
    }
    if (source === "git") {
      const gitBody = body as unknown as GitImportBody;
      const url = typeof gitBody.url === "string" ? gitBody.url : "";
      if (!url.trim()) return NextResponse.json({ error: "url required" }, { status: 400 });
      const result = await gitImport(gitBody);
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "source must be market/local/git" }, { status: 400 });
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const output = ((err.stdout ?? "") + (err.stderr ?? "")).replace(ANSI_RE, "");
    return NextResponse.json({ error: output || err.message || String(e) }, { status: 500 });
  }
}