import { NextResponse } from "next/server";
import { readdirSync, realpathSync, statSync } from "fs";
import { homedir } from "os";
import { isAbsolute, relative, resolve } from "path";

function isWithin(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target);
  return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot));
}

// GET /api/cwd/browse?path=/home/user/project
// Lists directories below the user's home directory for the workspace picker.
export async function GET(request: Request) {
  const requestedPath = new URL(request.url).searchParams.get("path");

  try {
    const home = realpathSync(homedir());
    const candidate = requestedPath ? resolve(requestedPath) : home;
    if (!isWithin(home, candidate)) {
      return NextResponse.json({ error: "Directories must be inside the home folder" }, { status: 403 });
    }

    const directory = realpathSync(candidate);
    if (!isWithin(home, directory) || !statSync(directory).isDirectory()) {
      return NextResponse.json({ error: "Directory is not available" }, { status: 400 });
    }

    const entries = readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      try {
        const childPath = realpathSync(resolve(directory, entry.name));
        return isWithin(home, childPath) && statSync(childPath).isDirectory()
          ? [{ name: entry.name, path: childPath }]
          : [];
      } catch {
        return [];
      }
    }).sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ home, path: directory, entries });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
