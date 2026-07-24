import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("opens files with one tap on mobile", async () => {
  const tree = await readFile(new URL("./WorkspaceFileTree.tsx", import.meta.url), "utf8");

  assert.match(tree, /const isMobile = useIsMobile\(\);/);
  assert.match(tree, /if \(isMobile && !node\.isDir\) onOpenFile\(joinFilePath\(cwd, path\), node\.name\);/);
});
