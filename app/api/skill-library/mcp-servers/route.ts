import { NextResponse } from "next/server";
import { createLibraryMcpServer, scanLibraryMcpServers, type McpServerDefinition } from "@/lib/mcp-library";
import { ensureLibraryRoot, readConfig } from "@/lib/skill-packs-store";

export const dynamic = "force-dynamic";

function toInfo(server: ReturnType<typeof scanLibraryMcpServers>[number]) {
  return {
    serverKey: server.serverKey,
    name: server.name,
    description: server.description,
    source: server.source,
    sourceRef: server.sourceRef,
    definition: server.definition,
    configHash: server.configHash,
  };
}

export async function GET() {
  const config = ensureLibraryRoot(readConfig());
  return NextResponse.json({ mcpServers: config.libraryRoot ? scanLibraryMcpServers(config.libraryRoot).map(toInfo) : [] });
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { serverKey?: string; name?: string; description?: string; source?: string; sourceRef?: string; definition?: unknown };
    if (!body.serverKey?.trim() || body.definition === undefined) {
      return NextResponse.json({ error: "serverKey and definition required" }, { status: 400 });
    }
    const config = ensureLibraryRoot(readConfig());
    if (!config.libraryRoot) return NextResponse.json({ error: "library not configured" }, { status: 400 });
    const server = createLibraryMcpServer(config.libraryRoot, body.serverKey.trim(), { ...body, definition: body.definition as McpServerDefinition });
    return NextResponse.json({ server: toInfo(server) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
