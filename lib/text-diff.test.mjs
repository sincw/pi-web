import assert from "node:assert/strict";
import test from "node:test";

test("diffTextLines preserves context and reports both sides of a replacement", async () => {
  const { diffTextLines } = await import("./text-diff.ts");
  assert.deepEqual(diffTextLines("keep\nold\nend", "keep\nnew\nend"), [
    { type: "unchanged", text: "keep", lineNo: 1 },
    { type: "removed", text: "old", lineNo: 2 },
    { type: "added", text: "new", lineNo: 2 },
    { type: "unchanged", text: "end", lineNo: 3 },
  ]);
});

test("pairTextDiffLines aligns replacements and one-sided additions", async () => {
  const { diffTextLines, pairTextDiffLines } = await import("./text-diff.ts");
  const rows = pairTextDiffLines(diffTextLines("one\ntwo", "one\nthree\nfour"));
  assert.deepEqual(rows.map((row) => [row.left.text, row.right.text]), [["one", "one"], ["two", "three"], ["", "four"]]);
});
