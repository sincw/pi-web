import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { computeConfigHash } from "./content-hash";

const SERVER_FILE_SUFFIX = ".mcp.json";
const SERVER_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface McpServerDefinition {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  auth?: "oauth" | "bearer" | false;
  bearerTokenEnv?: string;
  lifecycle?: "keep-alive" | "lazy" | "eager";
  idleTimeout?: number;
  requestTimeoutMs?: number;
  excludeTools?: string[];
  exposeResources?: boolean;
}

export interface McpServerMetadata {
  name: string;
  description: string;
  source?: string;
  sourceRef?: string;
  definition: McpServerDefinition;
}

export interface LibraryMcpServer extends McpServerMetadata {
  serverKey: string;
  filePath: string;
  configHash: string;
}

export interface McpPackReference {
  serverKey: string;
  configHash: string;
}

export interface McpDeleteResult {
  ok: boolean;
  error?: string;
  referencedBy?: { packId: string; packName: string }[];
}

type MetadataInput = Omit<McpServerMetadata, "name" | "description"> & {
  name?: string;
  description?: string;
};

const ALLOWED_FIELDS = new Set([
  "command",
  "args",
  "env",
  "cwd",
  "url",
  "headers",
  "auth",
  "bearerTokenEnv",
  "lifecycle",
  "idleTimeout",
  "requestTimeoutMs",
  "excludeTools",
  "exposeResources",
]);

export function getLibraryMcpServersDir(libraryRoot: string): string {
  return join(libraryRoot, ".pi", "mcp-servers");
}

export function validateServerKey(serverKey: string): string {
  if (!SERVER_KEY.test(serverKey) || serverKey === "." || serverKey === "..") {
    throw new Error("serverKey must be a safe file name");
  }
  return serverKey;
}

function assertStringRecord(value: unknown, field: string): asserts value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object`);
  if (Object.values(value).some((item) => typeof item !== "string")) {
    throw new Error(`${field} values must be strings`);
  }
}

function assertStringArray(value: unknown, field: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${field} must be an array of strings`);
  }
}

/** Validate the subset of adapter config that Pack definitions are allowed to own. */
export function validateMcpDefinition(value: unknown): McpServerDefinition {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("definition must be an object");
  }
  const definition = value as Record<string, unknown>;
  for (const key of Object.keys(definition)) {
    if (key === "directTools") {
      throw new Error("directTools is global adapter configuration and is not supported in MCP Packs");
    }
    if (!ALLOWED_FIELDS.has(key)) {
      throw new Error(`definition field "${key}" is not supported in MCP Packs`);
    }
  }
  const command = definition.command;
  const url = definition.url;
  if ((typeof command === "string") === (typeof url === "string")) {
    throw new Error("definition needs exactly one of command or url");
  }
  if (typeof command === "string" && !command.trim()) throw new Error("command must not be empty");
  if (typeof url === "string" && !url.trim()) throw new Error("url must not be empty");
  if (command !== undefined && typeof command !== "string") throw new Error("command must be a string");
  if (url !== undefined && typeof url !== "string") throw new Error("url must be a string");
  if (definition.args !== undefined) assertStringArray(definition.args, "args");
  if (definition.excludeTools !== undefined) assertStringArray(definition.excludeTools, "excludeTools");
  if (definition.env !== undefined) assertStringRecord(definition.env, "env");
  if (definition.headers !== undefined) {
    assertStringRecord(definition.headers, "headers");
    if (Object.keys(definition.headers).some((key) => key.toLowerCase() === "authorization")) {
      throw new Error("Authorization headers are not allowed in MCP Pack definitions");
    }
  }
  if (definition.cwd !== undefined && typeof definition.cwd !== "string") throw new Error("cwd must be a string");
  if (definition.bearerTokenEnv !== undefined && typeof definition.bearerTokenEnv !== "string") {
    throw new Error("bearerTokenEnv must be a string");
  }
  if (definition.auth !== undefined && definition.auth !== "oauth" && definition.auth !== "bearer" && definition.auth !== false) {
    throw new Error("auth must be oauth, bearer, or false");
  }
  if (definition.lifecycle !== undefined && !["keep-alive", "lazy", "eager"].includes(String(definition.lifecycle))) {
    throw new Error("lifecycle must be keep-alive, lazy, or eager");
  }
  for (const key of ["idleTimeout", "requestTimeoutMs"] as const) {
    if (definition[key] !== undefined && (typeof definition[key] !== "number" || !Number.isFinite(definition[key]))) {
      throw new Error(`${key} must be a finite number`);
    }
  }
  if (definition.exposeResources !== undefined && typeof definition.exposeResources !== "boolean") {
    throw new Error("exposeResources must be a boolean");
  }
  return definition as McpServerDefinition;
}

function parseServer(serverKey: string, filePath: string): LibraryMcpServer | null {
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as Partial<McpServerMetadata>;
    const definition = validateMcpDefinition(raw.definition);
    return {
      serverKey,
      filePath,
      name: typeof raw.name === "string" && raw.name.trim() ? raw.name : serverKey,
      description: typeof raw.description === "string" ? raw.description : "",
      source: typeof raw.source === "string" ? raw.source : undefined,
      sourceRef: typeof raw.sourceRef === "string" ? raw.sourceRef : undefined,
      definition,
      configHash: computeConfigHash(definition),
    };
  } catch {
    return null;
  }
}

function findEntry(libraryRoot: string, serverKey: string): { key: string; filePath: string } | null {
  const dir = getLibraryMcpServersDir(libraryRoot);
  if (!existsSync(dir)) return null;
  const target = serverKey.toLowerCase();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(SERVER_FILE_SUFFIX)) continue;
    const key = entry.name.slice(0, -SERVER_FILE_SUFFIX.length);
    if (key.toLowerCase() === target) return { key, filePath: join(dir, entry.name) };
  }
  return null;
}

export function scanLibraryMcpServers(libraryRoot: string): LibraryMcpServer[] {
  const dir = getLibraryMcpServersDir(libraryRoot);
  if (!existsSync(dir)) return [];
  const servers: LibraryMcpServer[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(SERVER_FILE_SUFFIX)) continue;
    const serverKey = entry.name.slice(0, -SERVER_FILE_SUFFIX.length);
    const server = parseServer(serverKey, join(dir, entry.name));
    if (server) servers.push(server);
  }
  return servers.sort((a, b) => a.serverKey.localeCompare(b.serverKey));
}

export function getLibraryMcpServer(libraryRoot: string, serverKey: string): LibraryMcpServer | null {
  const entry = findEntry(libraryRoot, serverKey);
  return entry ? parseServer(entry.key, entry.filePath) : null;
}

function writeServerFile(filePath: string, metadata: McpServerMetadata): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  renameSync(tmp, filePath);
}

function normalizeMetadata(serverKey: string, value: MetadataInput): McpServerMetadata {
  return {
    name: value.name?.trim() || serverKey,
    description: value.description?.trim() ?? "",
    source: value.source?.trim() || undefined,
    sourceRef: value.sourceRef?.trim() || undefined,
    definition: validateMcpDefinition(value.definition),
  };
}

export function createLibraryMcpServer(libraryRoot: string, serverKey: string, value: MetadataInput): LibraryMcpServer {
  validateServerKey(serverKey);
  if (findEntry(libraryRoot, serverKey)) throw new Error(`An MCP server named "${serverKey}" already exists in the library`);
  const filePath = join(getLibraryMcpServersDir(libraryRoot), `${serverKey}${SERVER_FILE_SUFFIX}`);
  writeServerFile(filePath, normalizeMetadata(serverKey, value));
  return getLibraryMcpServer(libraryRoot, serverKey)!;
}

export function updateLibraryMcpServer(
  libraryRoot: string,
  serverKey: string,
  patch: Partial<MetadataInput> & { serverKey?: string },
): LibraryMcpServer {
  const existing = getLibraryMcpServer(libraryRoot, serverKey);
  if (!existing) throw new Error("MCP server not found");
  const nextKey = patch.serverKey ?? existing.serverKey;
  validateServerKey(nextKey);
  const collision = findEntry(libraryRoot, nextKey);
  if (collision && collision.key.toLowerCase() !== existing.serverKey.toLowerCase()) {
    throw new Error(`An MCP server named "${nextKey}" already exists in the library`);
  }
  const metadata = normalizeMetadata(nextKey, {
    name: patch.name ?? existing.name,
    description: patch.description ?? existing.description,
    source: patch.source ?? existing.source,
    sourceRef: patch.sourceRef ?? existing.sourceRef,
    definition: patch.definition ?? existing.definition,
  });
  const nextPath = join(getLibraryMcpServersDir(libraryRoot), `${nextKey}${SERVER_FILE_SUFFIX}`);
  writeServerFile(nextPath, metadata);
  if (nextPath !== existing.filePath) rmSync(existing.filePath, { force: true });
  return getLibraryMcpServer(libraryRoot, nextKey)!;
}

/** Remove a library MCP server, refusing if any pack still references it. */
export function deleteLibraryMcpServer(
  libraryRoot: string,
  serverKey: string,
  referencedBy: { packId: string; packName: string }[],
): McpDeleteResult {
  if (referencedBy.length > 0) {
    return {
      ok: false,
      error: `MCP server "${serverKey}" is referenced by ${referencedBy.length} pack(s)`,
      referencedBy,
    };
  }
  const entry = findEntry(libraryRoot, serverKey);
  if (!entry) return { ok: true };
  rmSync(entry.filePath, { force: true });
  return { ok: true };
}
