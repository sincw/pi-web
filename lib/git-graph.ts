export type GraphCommit = { sha: string; parents: string[] };

export type GraphRow = {
  sha: string;
  lane: number;
  lanes: number;
  startsHere: boolean;
  continuations: { from: number; to: number; sha: string }[];
  parents: { to: number; sha: string }[];
};

export function buildCommitGraph(commits: GraphCommit[]): GraphRow[] {
  let lanes: string[] = [];
  return commits.map((commit) => {
    let lane = lanes.indexOf(commit.sha);
    const startsHere = lane < 0;
    if (startsHere) {
      lane = lanes.length;
      lanes = [...lanes, commit.sha];
    }
    const before = lanes;
    const parents = [...new Set(commit.parents)];
    const after = [...before];
    after.splice(lane, 1, ...parents);
    const seen = new Set<string>();
    const next = after.filter((sha) => {
      if (seen.has(sha)) return false;
      seen.add(sha);
      return true;
    });
    const row = {
      sha: commit.sha,
      lane,
      lanes: Math.max(before.length, next.length, 1),
      startsHere,
      continuations: before.flatMap((sha, from) => sha === commit.sha ? [] : [{ from, to: next.indexOf(sha), sha }]).filter(({ to }) => to >= 0),
      parents: parents.map((sha) => ({ to: next.indexOf(sha), sha })).filter(({ to }) => to >= 0),
    };
    lanes = next;
    return row;
  });
}
