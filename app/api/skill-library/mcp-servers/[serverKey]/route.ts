import { NextResponse } from "next/server";
import { deleteLibraryMcpServer, getLibraryMcpServer, updateLibraryMcpServer, type McpServerDefinition } from "@/lib/mcp-library";
import { ensureLibraryRoot, findPacksReferencingMcpServerKey, readConfig } from "@/lib/skill-packs-store";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ serverKey: string }>;
}

function toInfo(server: NonNullable<ReturnType<typeof getLibraryMcpServer>>) {
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

function libraryRoot(): string | null {
  return ensureLibraryRoot(readConfig()).libraryRoot;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const root = libraryRoot();
  const { serverKey } = await params;
  const server = root ? getLibraryMcpServer(root, serverKey) : null;
  return server ? NextResponse.json(toInfo(server)) : NextResponse.json({ error: "MCP server not found" }, { status: 404 });
}

export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const root = libraryRoot();
    if (!root) return NextResponse.json({ error: "library not configured" }, { status: 400 });
    const { serverKey } = await params;
    const body = await req.json() as { serverKey?: string; name?: string; description?: string; source?: string; sourceRef?: string; definition?: unknown };
    const server = updateLibraryMcpServer(root, serverKey, { ...body, definition: body.definition as McpServerDefinition | undefined });
    return NextResponse.json({ server: toInfo(server) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  try {
    const config = ensureLibraryRoot(readConfig());
    if (!config.libraryRoot) return NextResponse.json({ error: "library not configured" }, { status: 400 });
    const { serverKey } = await params;
    const result = deleteLibraryMcpServer(
      config.libraryRoot,
      serverKey,
      findPacksReferencingMcpServerKey(config, serverKey),
    );
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
