export type GitBranch = { name: string; kind: "local" | "remote"; current: boolean };

export function parseGitBranches(raw: string): GitBranch[] {
  const branches: GitBranch[] = [];
  for (const line of raw.split("\n")) {
    const [full, current] = line.split("\t");
    if (!full) continue;
    if (full.startsWith("refs/heads/")) branches.push({ name: full.slice("refs/heads/".length), kind: "local", current: current === "*" });
    if (full.startsWith("refs/remotes/") && !full.endsWith("/HEAD")) branches.push({ name: full.slice("refs/remotes/".length), kind: "remote", current: false });
  }
  return branches;
}
