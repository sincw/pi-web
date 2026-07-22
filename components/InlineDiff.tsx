"use client";

import { useMemo } from "react";
import { diffTextLines, pairTextDiffLines, type SplitTextDiffCell, type TextDiffLine } from "@/lib/text-diff";

type Segment = { hidden: true; count: number } | { hidden: false; lines: TextDiffLine[] };

const MAX_INLINE_DIFF_CHARS = 300_000;

function visibleSegments(lines: TextDiffLine[]): Segment[] {
  const changed = new Set(lines.flatMap((line, index) => line.type === "unchanged" ? [] : [index]));
  const visible = new Set<number>();
  for (const index of changed) {
    for (let current = Math.max(0, index - 3); current <= Math.min(lines.length - 1, index + 3); current++) {
      visible.add(current);
    }
  }

  const segments: Segment[] = [];
  for (let index = 0; index < lines.length;) {
    if (visible.has(index)) {
      const block: TextDiffLine[] = [];
      while (index < lines.length && visible.has(index)) block.push(lines[index++]);
      segments.push({ hidden: false, lines: block });
    } else {
      let count = 0;
      while (index < lines.length && !visible.has(index)) {
        count++;
        index++;
      }
      segments.push({ hidden: true, count });
    }
  }
  return segments;
}

export function InlineDiff({ oldContent, newContent }: { oldContent: string; newContent: string }) {
  const tooLarge = oldContent.length + newContent.length > MAX_INLINE_DIFF_CHARS;
  const lines = useMemo(() => tooLarge ? [] : diffTextLines(oldContent, newContent), [oldContent, newContent, tooLarge]);
  const segments = useMemo(() => visibleSegments(lines), [lines]);
  const newLineNumbers = useMemo(() => {
    let lineNo = 1;
    return lines.map((line) => line.type === "removed" ? null : lineNo++);
  }, [lines]);

  if (tooLarge) {
    return <div className="inline-diff-notice">This diff is too large to render inline. Open the file to inspect it.</div>;
  }
  if (!lines.some((line) => line.type !== "unchanged")) {
    return <div className="inline-diff-notice">No textual changes to display.</div>;
  }

  let offset = 0;
  return (
    <div className="inline-diff" role="region" aria-label="Code diff">
      {segments.map((segment, segmentIndex) => {
        if (segment.hidden) {
          offset += segment.count;
          return <div key={segmentIndex} className="inline-diff-fold">... {segment.count} unchanged lines ...</div>;
        }
        const rendered = segment.lines.map((line, lineIndex) => {
          const index = offset + lineIndex;
          const prefix = line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";
          return (
            <div key={index} className={`inline-diff-line inline-diff-${line.type}`}>
              <span className="inline-diff-line-number">{line.type === "added" ? newLineNumbers[index] : line.lineNo}</span>
              <span className="inline-diff-prefix">{prefix}</span>
              <code>{line.text || "\u00a0"}</code>
            </div>
          );
        });
        offset += segment.lines.length;
        return <div key={segmentIndex}>{rendered}</div>;
      })}
    </div>
  );
}

function SplitDiffCell({ cell }: { cell: SplitTextDiffCell }) {
  const prefix = cell.type === "added" ? "+" : cell.type === "removed" ? "-" : " ";
  return <div className={`split-diff-cell split-diff-${cell.type}`}>
    <span className="split-diff-line-number">{cell.lineNo ?? ""}</span>
    <span className="split-diff-prefix">{prefix}</span>
    <code>{cell.text || "\u00a0"}</code>
  </div>;
}

export function SplitDiff({ oldContent, newContent }: { oldContent: string; newContent: string }) {
  const tooLarge = oldContent.length + newContent.length > MAX_INLINE_DIFF_CHARS;
  const lines = useMemo(() => tooLarge ? [] : diffTextLines(oldContent, newContent), [oldContent, newContent, tooLarge]);
  const segments = useMemo(() => visibleSegments(lines), [lines]);
  const pairs = useMemo(() => segments.map((segment) => segment.hidden ? null : pairTextDiffLines(segment.lines)), [segments]);

  if (tooLarge) return <div className="inline-diff-notice">This diff is too large to render inline. Open the file to inspect it.</div>;
  if (!lines.some((line) => line.type !== "unchanged")) return <div className="inline-diff-notice">No textual changes to display.</div>;

  return <div className="split-diff" role="region" aria-label="Side-by-side code diff">
    {(["left", "right"] as const).map((side) => (
      <div key={side} className="split-diff-pane" aria-label={side === "left" ? "Original" : "Modified"}>
        {segments.map((segment, segmentIndex) => segment.hidden ? (
          <div key={segmentIndex} className="split-diff-fold">... {segment.count} unchanged lines ...</div>
        ) : pairs[segmentIndex]?.map((row, rowIndex) => <SplitDiffCell key={`${segmentIndex}:${rowIndex}`} cell={row[side]} />))}
      </div>
    ))}
  </div>;
}
