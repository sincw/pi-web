// Pure parsing for the Files Changed panel. Route handlers feed raw `git`
// stdout through these functions so the rename/binary/untracked edge cases
// stay in one testable place instead of inline in the Next route.

export type DiffSection = "staged" | "unstaged" | "branch";

export interface ChangedFile {
  path: string;
  status: string; // single letter: M, A, D, R, U
  added: number;
  deleted: number;
  // For renames/copies (status R): the source path, so the per-file diff can
  // resolve a baseline from the side that still holds the file (HEAD:source
  // for staged, :source for unstaged). Undefined for M/A/D/U.
  sourcePath?: string;
}

// Parse one `git diff` scope (either staged via --cached or unstaged).
// nameStatus comes from `git diff [--cached] --name-status`,
// numstat comes from `git diff [--cached] --numstat`.
//
// Renames (R) and copies (C) report two paths ("R100\told\tnew"); they're
// folded to the destination path with status "R", since numstat emits the
// destination path and the two line up that way. numstat prints `-` (not a
// number) for binary files; `parseInt("-") || 0` yields 0, the honest "we
// can't count lines" value.
export function parseDiffSection(nameStatus: string, numstat: string): ChangedFile[] {
  const statusByPath = new Map<string, { letter: string; source?: string }>();
  for (const line of nameStatus.split("\n")) {
    if (!line.trim()) continue;
    const [statusRaw, ...parts] = line.split("\t");
    const segs = parts.filter(Boolean);
    const letter = statusRaw.charAt(0);
    const folded = letter === "C" ? "R" : letter; // Q14/Q2: copy displays as rename
    const dst = segs[segs.length - 1];
    // R/C lines carry two paths; the first is the rename source.
    const source = (folded === "R" && segs.length >= 2) ? segs[0] : undefined;
    if (dst) statusByPath.set(dst, { letter: folded, source });
  }

  const files: ChangedFile[] = [];
  for (const line of numstat.split("\n")) {
    if (!line.trim()) continue;
    const [addedRaw, deletedRaw, pRaw] = line.split("\t");
    if (!pRaw) continue;
    // git prints renames in numstat as "src => dst"; we key on the destination
    // to line up with `--name-status`'s R/C line (tab-separated src/ dst).
    const p = pRaw.includes(" => ") ? pRaw.split(" => ").pop()!.trim() : pRaw;
    const meta = statusByPath.get(p) || { letter: "M" };
    files.push({
      path: p,
      status: meta.letter,
      added: parseInt(addedRaw) || 0,
      deleted: parseInt(deletedRaw) || 0,
      ...(meta.source ? { sourcePath: meta.source } : {}),
    });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

// Untracked files come from `git ls-files --others --exclude-standard`.
// They only ever land in the Unstaged section, never Staged.
export function parseUntracked(untracked: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  for (const p of untracked.split("\n")) {
    if (!p.trim()) continue;
    files.push({ path: p, status: "U", added: 0, deleted: 0 });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

// Section/total counter. Untracked files carry no line counts (numstat
// doesn't cover them), so the totals honestly count tracked files only.
export function sumChanges(files: ChangedFile[]): { added: number; deleted: number } {
  let added = 0;
  let deleted = 0;
  for (const f of files) {
    if (f.status === "U") continue;
    added += f.added;
    deleted += f.deleted;
  }
  return { added, deleted };
}
