export type TextDiffLine =
  | { type: "unchanged"; text: string; lineNo: number }
  | { type: "removed"; text: string; lineNo: number }
  | { type: "added"; text: string; lineNo: number };

export type SplitTextDiffCell = { lineNo: number | null; text: string; type: TextDiffLine["type"] | "empty" };
export type SplitTextDiffRow = { left: SplitTextDiffCell; right: SplitTextDiffCell };

// Myers diff keeps the review renderer linear in unchanged input and avoids
// the quadratic matrix a basic LCS implementation would allocate.
export function diffTextLines(oldContent: string, newContent: string): TextDiffLine[] {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const m = oldLines.length;
  const n = newLines.length;
  const max = m + n;
  const v: number[] = new Array(2 * max + 1).fill(0);
  const trace: number[][] = [];

  for (let d = 0; d <= max; d++) {
    trace.push([...v]);
    for (let k = -d; k <= d; k += 2) {
      const x = k === -d || (k !== d && v[k - 1 + max] < v[k + 1 + max])
        ? v[k + 1 + max]
        : v[k - 1 + max] + 1;
      let nextX = x;
      let y = nextX - k;
      while (nextX < m && y < n && oldLines[nextX] === newLines[y]) {
        nextX++;
        y++;
      }
      v[k + max] = nextX;
      if (nextX < m || y < n) continue;

      const result: TextDiffLine[] = [];
      let currentX = m;
      let currentY = n;
      for (let depth = d; depth > 0; depth--) {
        const previous = trace[depth];
        const currentK = currentX - currentY;
        const previousK = currentK === -depth || (currentK !== depth && previous[currentK - 1 + max] < previous[currentK + 1 + max])
          ? currentK + 1
          : currentK - 1;
        const previousX = previous[previousK + max];
        const previousY = previousX - previousK;
        while (currentX > previousX && currentY > previousY) {
          currentX--;
          currentY--;
          result.unshift({ type: "unchanged", text: oldLines[currentX], lineNo: currentX + 1 });
        }
        if (currentX === previousX) {
          currentY--;
          result.unshift({ type: "added", text: newLines[currentY], lineNo: currentY + 1 });
        } else {
          currentX--;
          result.unshift({ type: "removed", text: oldLines[currentX], lineNo: currentX + 1 });
        }
      }
      while (currentX > 0 && currentY > 0) {
        currentX--;
        currentY--;
        result.unshift({ type: "unchanged", text: oldLines[currentX], lineNo: currentX + 1 });
      }
      while (currentX > 0) {
        currentX--;
        result.unshift({ type: "removed", text: oldLines[currentX], lineNo: currentX + 1 });
      }
      while (currentY > 0) {
        currentY--;
        result.unshift({ type: "added", text: newLines[currentY], lineNo: currentY + 1 });
      }
      return result;
    }
  }

  return [
    ...oldLines.map((text, index) => ({ type: "removed" as const, text, lineNo: index + 1 })),
    ...newLines.map((text, index) => ({ type: "added" as const, text, lineNo: index + 1 })),
  ];
}

export function pairTextDiffLines(lines: TextDiffLine[]): SplitTextDiffRow[] {
  const rows: SplitTextDiffRow[] = [];
  let removed: TextDiffLine[] = [];
  let added: TextDiffLine[] = [];
  const flushChanges = () => {
    const count = Math.max(removed.length, added.length);
    for (let index = 0; index < count; index++) {
      const left = removed[index];
      const right = added[index];
      rows.push({
        left: left ? { ...left } : { lineNo: null, text: "", type: "empty" },
        right: right ? { ...right } : { lineNo: null, text: "", type: "empty" },
      });
    }
    removed = [];
    added = [];
  };

  for (const line of lines) {
    if (line.type === "removed") removed.push(line);
    else if (line.type === "added") added.push(line);
    else {
      flushChanges();
      rows.push({ left: { ...line }, right: { ...line } });
    }
  }
  flushChanges();
  return rows;
}
