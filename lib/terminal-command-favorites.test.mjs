import assert from "node:assert/strict";
import test from "node:test";
import {
  createTerminalFavoriteFolder,
  deleteTerminalFavoriteFolder,
  hasTerminalFavorite,
  readTerminalCommandFavorites,
  renameTerminalFavoriteFolder,
  removeTerminalFavorite,
  saveTerminalFavorite,
} from "./terminal-command-favorites.ts";

test("terminal favorites migrate, group, move, and remove commands", () => {
  let favorites = readTerminalCommandFavorites(["git status", "git status", ""]);
  assert.deepEqual(favorites, { folders: [{ id: "legacy", name: "收藏", commands: ["git status"] }] });
  favorites = createTerminalFavoriteFolder(favorites, "deploy", "部署");
  favorites = saveTerminalFavorite(favorites, "deploy", "npm run deploy");
  favorites = saveTerminalFavorite(favorites, "legacy", "npm run deploy");
  assert.equal(hasTerminalFavorite(favorites, "npm run deploy"), true);
  assert.deepEqual(favorites.folders.map((folder) => folder.commands), [["npm run deploy", "git status"], []]);
  assert.equal(hasTerminalFavorite(removeTerminalFavorite(favorites, "legacy", "npm run deploy"), "npm run deploy"), false);
  favorites = renameTerminalFavoriteFolder(favorites, "deploy", "发布");
  assert.equal(favorites.folders[1].name, "发布");
  assert.deepEqual(deleteTerminalFavoriteFolder(favorites, "legacy"), { folders: [{ id: "deploy", name: "发布", commands: [] }] });
});
