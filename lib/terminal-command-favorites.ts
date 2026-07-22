export type TerminalFavoriteFolder = {
  id: string;
  name: string;
  commands: string[];
};

export type TerminalCommandFavorites = { folders: TerminalFavoriteFolder[] };

const EMPTY_FAVORITES: TerminalCommandFavorites = { folders: [] };

function validCommands(value: unknown, seen = new Set<string>()) {
  if (!Array.isArray(value)) return [];
  return value.filter((command): command is string => typeof command === "string" && command.trim().length > 0 && !seen.has(command) && (seen.add(command), true));
}

export function readTerminalCommandFavorites(value: unknown): TerminalCommandFavorites {
  if (Array.isArray(value)) {
    const commands = validCommands(value);
    return commands.length ? { folders: [{ id: "legacy", name: "收藏", commands }] } : EMPTY_FAVORITES;
  }
  if (!value || typeof value !== "object" || !Array.isArray((value as { folders?: unknown }).folders)) return EMPTY_FAVORITES;
  const ids = new Set<string>();
  const commands = new Set<string>();
  const folders = (value as { folders: unknown[] }).folders.flatMap((folder) => {
    if (!folder || typeof folder !== "object") return [];
    const { id, name, commands: folderCommands } = folder as Partial<TerminalFavoriteFolder>;
    if (typeof id !== "string" || !id || ids.has(id) || typeof name !== "string" || !name.trim()) return [];
    ids.add(id);
    return [{ id, name: name.trim(), commands: validCommands(folderCommands, commands) }];
  });
  return { folders };
}

export function createTerminalFavoriteFolder(favorites: TerminalCommandFavorites, id: string, name: string) {
  const folderName = name.trim().slice(0, 40);
  if (!id || !folderName || favorites.folders.some((folder) => folder.name === folderName)) return favorites;
  return { folders: [...favorites.folders, { id, name: folderName, commands: [] }] };
}

export function renameTerminalFavoriteFolder(favorites: TerminalCommandFavorites, folderId: string, name: string) {
  const folderName = name.trim().slice(0, 40);
  if (!folderName || favorites.folders.some((folder) => folder.id !== folderId && folder.name === folderName)) return favorites;
  return { folders: favorites.folders.map((folder) => folder.id === folderId ? { ...folder, name: folderName } : folder) };
}

export function deleteTerminalFavoriteFolder(favorites: TerminalCommandFavorites, folderId: string) {
  return { folders: favorites.folders.filter((folder) => folder.id !== folderId) };
}

export function saveTerminalFavorite(favorites: TerminalCommandFavorites, folderId: string, command: string) {
  if (!command.trim() || !favorites.folders.some((folder) => folder.id === folderId)) return favorites;
  return {
    folders: favorites.folders.map((folder) => folder.id === folderId
      ? { ...folder, commands: [command, ...folder.commands.filter((item) => item !== command)] }
      : { ...folder, commands: folder.commands.filter((item) => item !== command) }),
  };
}

export function removeTerminalFavorite(favorites: TerminalCommandFavorites, folderId: string, command: string) {
  return { folders: favorites.folders.map((folder) => folder.id === folderId ? { ...folder, commands: folder.commands.filter((item) => item !== command) } : folder) };
}

export function hasTerminalFavorite(favorites: TerminalCommandFavorites, command: string) {
  return favorites.folders.some((folder) => folder.commands.includes(command));
}
