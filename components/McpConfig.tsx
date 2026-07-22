"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { LibraryMcpServerInfo, WorkspaceMcpServerInfo } from "@/lib/api-types";

type Tab = "workspace" | "library" | "acquire";

function shortenPath(path: string): string {
  return path.replace(/^\/(?:Users|home)\/[^/]+/, "~");
}

function connectionLabel(definition: Record<string, unknown>): string {
  if (typeof definition.url === "string") return definition.url;
  if (typeof definition.command !== "string") return "MCP server";
  const args = Array.isArray(definition.args) ? definition.args.filter((arg): arg is string => typeof arg === "string") : [];
  return [definition.command, ...args].join(" ");
}

type DisplayServer = {
  serverKey: string;
  definition: Record<string, unknown>;
  name?: string;
  description?: string;
  source?: WorkspaceMcpServerInfo["source"];
  managedByPack?: boolean;
};

function ServerDetail({ server }: { server: DisplayServer }) {
  const source = server.source === "team-project" ? "team project" : "pi project";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        {server.source && <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, color: server.source === "pi-project" ? "var(--accent)" : "var(--text-dim)", background: server.source === "pi-project" ? "color-mix(in srgb, var(--accent) 12%, var(--bg))" : "rgba(120,120,120,0.12)" }}>{source}</span>}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{server.serverKey}</span>
        {server.managedByPack && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, color: "#16a34a", background: "rgba(34,197,94,0.1)" }}>Pack managed</span>}
      </div>
      {server.name && server.name !== server.serverKey && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>Name</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--text)" }}>{server.name}</span>
        </div>
      )}
      {server.description && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>Description</span>
          <span style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.6 }}>{server.description}</span>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>Server key</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>{server.serverKey}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>Connection</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)", overflowWrap: "anywhere" }}>{connectionLabel(server.definition)}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>Definition</span>
        <pre style={{ margin: 0, padding: 12, overflow: "auto", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-panel)", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.55 }}>{JSON.stringify(server.definition, null, 2)}</pre>
      </div>
    </div>
  );
}

function WorkspaceTab({ cwd, refreshKey, isMobile, onClose }: { cwd: string; refreshKey: number; isMobile: boolean; onClose: () => void }) {
  const [servers, setServers] = useState<WorkspaceMcpServerInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const serverId = (server: WorkspaceMcpServerInfo) => `${server.source}:${server.serverKey}`;

  const load = useCallback(async () => {
    const response = await fetch(`/api/mcp/servers?cwd=${encodeURIComponent(cwd)}`);
    const data = (await response.json()) as { servers?: WorkspaceMcpServerInfo[]; error?: string };
    if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
    return data.servers ?? [];
  }, [cwd]);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);
    void load()
      .then((items) => {
        if (ignore) return;
        setServers(items);
        setSelected((current) => items.some((item) => serverId(item) === current) ? current : items[0] ? serverId(items[0]) : null);
      })
      .catch((reason) => !ignore && setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => !ignore && setLoading(false));
    return () => {
      ignore = true;
    };
  }, [load, refreshKey]);

  const active = servers.find((server) => serverId(server) === selected) ?? null;
  const groups = [
    { label: "pack managed", servers: servers.filter((server) => server.managedByPack) },
    { label: "team project", servers: servers.filter((server) => !server.managedByPack && server.source === "team-project") },
    { label: "pi project", servers: servers.filter((server) => !server.managedByPack && server.source === "pi-project") },
  ].filter((group) => group.servers.length > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", overflow: "hidden", padding: "14px 18px" }}>
        <div style={{ width: isMobile ? "100%" : 210, maxHeight: isMobile ? "40vh" : undefined, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden", borderRight: isMobile ? "none" : "1px solid var(--border)", borderBottom: isMobile ? "1px solid var(--border)" : "none", borderRadius: 6, marginRight: isMobile ? 0 : 14, marginBottom: isMobile ? 14 : 0, background: "var(--bg-panel)" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 6px" }}>
            {loading ? <div style={{ padding: 10, fontSize: 12, color: "var(--text-muted)" }}>Loading...</div>
              : error ? <div style={{ padding: 10, fontSize: 12, color: "#f87171" }}>{error}</div>
                : servers.length === 0 ? <div style={{ padding: 10, fontSize: 12, color: "var(--text-dim)" }}>No MCP servers configured</div>
                  : groups.map((group) => (
                    <div key={group.label} style={{ marginBottom: 6 }}>
                      <div style={{ padding: "4px 8px 3px", color: "var(--text-dim)", fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{group.label}</div>
                      {group.servers.map((server) => {
                        const isSelected = serverId(server) === selected;
                        return (
                          <button key={serverId(server)} type="button" onClick={() => setSelected(serverId(server))} style={{ width: "100%", display: "flex", alignItems: "center", gap: 7, padding: "8px", border: 0, borderRadius: 5, background: isSelected ? "var(--bg-selected)" : "none", color: "var(--text)", cursor: "pointer", textAlign: "left" }} onMouseEnter={(event) => { if (!isSelected) event.currentTarget.style.background = "var(--bg-hover)"; }} onMouseLeave={(event) => { if (!isSelected) event.currentTarget.style.background = "none"; }}>
                            <span style={{ width: 7, height: 7, flexShrink: 0, borderRadius: "50%", background: "var(--accent)", boxShadow: "0 0 4px var(--accent)" }} />
                            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: isSelected ? 600 : 400 }}>{server.serverKey}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "0 0 0 4px" }}>
          {active ? <ServerDetail server={active} /> : !loading && !error && <div style={{ height: "100%", display: "grid", placeItems: "center", color: "var(--text-dim)", fontSize: 13 }}>Select an MCP server</div>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "10px 18px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
        <button type="button" onClick={onClose} style={{ padding: "6px 14px", background: "none", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-muted)", cursor: "pointer", fontSize: 13 }}>Close</button>
      </div>
    </div>
  );
}

function LibraryTab({ refreshKey, onEdit }: { refreshKey: number; onEdit: (serverKey: string) => void }) {
  const [servers, setServers] = useState<LibraryMcpServerInfo[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/skill-library/mcp-servers");
    const data = (await response.json()) as { mcpServers?: LibraryMcpServerInfo[]; error?: string };
    if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
    return data.mcpServers ?? [];
  }, []);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);
    void load()
      .then((items) => !ignore && setServers(items))
      .catch((reason) => !ignore && setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => !ignore && setLoading(false));
    return () => {
      ignore = true;
    };
  }, [load, refreshKey]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? servers.filter((server) => [server.serverKey, server.name, server.description].some((value) => value.toLowerCase().includes(normalized))) : servers;
  }, [query, servers]);

  const removeServer = async (server: LibraryMcpServerInfo) => {
    if (!confirm(`Remove "${server.name}" from the library?`)) return;
    setRemoving(server.serverKey);
    setError(null);
    try {
      const response = await fetch(`/api/skill-library/mcp-servers/${encodeURIComponent(server.serverKey)}`, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
      setServers((items) => items.filter((item) => item.serverKey.toLowerCase() !== server.serverKey.toLowerCase()));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="skills-library">
      <div className="skills-library-heading">
        <div><h2>Library MCP servers</h2></div>
        <label className="skills-library-search"><span className="sr-only">Search library MCP servers</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search library MCP servers" /></label>
      </div>
      {error && <div className="skills-market-error">{error}</div>}
      {loading ? <div className="skills-market-empty">Loading library...</div>
        : servers.length === 0 ? <div className="skills-market-empty">No MCP servers in the library yet. Add one from Acquire.</div>
          : visible.length === 0 ? <div className="skills-market-empty">No library MCP servers match this search.</div>
            : <div className="skill-card-grid mcp-library-grid">{visible.map((server) => (
              <article className="skill-library-card" key={server.serverKey}>
                <div className="skill-market-card-heading"><span className="skill-source-mark" aria-hidden="true">{server.serverKey.slice(0, 1).toUpperCase()}</span><strong title={server.name}>{server.name}</strong><button type="button" className="skill-library-edit" onClick={() => onEdit(server.serverKey)} title={`Edit ${server.name}`} aria-label={`Edit ${server.name}`}>✎</button><button type="button" className="skill-library-remove" onClick={() => void removeServer(server)} disabled={removing === server.serverKey} title={`Remove ${server.name} from library`} aria-label={`Remove ${server.name} from library`}>×</button></div>
              </article>
            ))}</div>}
    </div>
  );
}

const DEFAULT_DEFINITION = '{\n  "command": "npx",\n  "args": ["-y", "example-mcp"]\n}';

function AcquireTab({ editServerKey, onSaved }: { editServerKey: string | null; onSaved: () => void }) {
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [servers, setServers] = useState<LibraryMcpServerInfo[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [serverKey, setServerKey] = useState("");
  const [description, setDescription] = useState("");
  const [definition, setDefinition] = useState(DEFAULT_DEFINITION);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadServers = useCallback(async () => {
    const response = await fetch("/api/skill-library/mcp-servers");
    const data = (await response.json()) as { mcpServers?: LibraryMcpServerInfo[]; error?: string };
    if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
    return data.mcpServers ?? [];
  }, []);

  useEffect(() => {
    let ignore = false;
    void loadServers()
      .then((items) => !ignore && setServers(items))
      .catch((reason) => !ignore && setError(reason instanceof Error ? reason.message : String(reason)));
    return () => {
      ignore = true;
    };
  }, [loadServers]);

  useEffect(() => {
    setMode(editServerKey ? "edit" : "create");
    if (editServerKey) setSelectedKey(editServerKey);
  }, [editServerKey]);

  useEffect(() => {
    if (mode === "create") {
      setServerKey("");
      setDescription("");
      setDefinition(DEFAULT_DEFINITION);
      return;
    }
    const server = servers.find((item) => item.serverKey.toLowerCase() === selectedKey.toLowerCase());
    if (!server) return;
    setServerKey(server.serverKey);
    setDescription(server.description);
    setDefinition(JSON.stringify(server.definition, null, 2));
  }, [mode, selectedKey, servers]);

  const save = async () => {
    const key = serverKey.trim();
    if (!key || (mode === "edit" && !selectedKey)) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(mode === "edit" ? `/api/skill-library/mcp-servers/${encodeURIComponent(selectedKey)}` : "/api/skill-library/mcp-servers", {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverKey: key, name: key, description: description.trim(), definition: JSON.parse(definition) }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="skills-market mcp-acquire">
      <div className="skills-market-title-row"><div><h2>{mode === "edit" ? "Edit MCP server" : "Add MCP server"}</h2></div></div>
      <form className="skills-import-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <label className="mcp-acquire-mode"><input type="checkbox" checked={mode === "edit"} onChange={(event) => { setError(null); setMode(event.target.checked ? "edit" : "create"); if (event.target.checked && !selectedKey) setSelectedKey(servers[0]?.serverKey ?? ""); }} disabled={servers.length === 0 && mode === "create"} /><span>Edit existing server</span></label>
        {mode === "edit" && <label htmlFor="mcp-server-select">MCP server<select id="mcp-server-select" value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)} disabled={servers.length === 0}>{servers.length === 0 ? <option value="">No MCP servers available</option> : servers.map((server) => <option key={server.serverKey} value={server.serverKey}>{server.name} ({server.serverKey})</option>)}</select></label>}
        <label htmlFor="mcp-server-key">Server key</label>
        <input id="mcp-server-key" value={serverKey} onChange={(event) => setServerKey(event.target.value)} placeholder="chrome-devtools" />
        <label htmlFor="mcp-server-description">Description</label>
        <input id="mcp-server-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional" />
        <label htmlFor="mcp-server-definition">Definition JSON</label>
        <textarea id="mcp-server-definition" value={definition} onChange={(event) => setDefinition(event.target.value)} rows={10} />
        {error && <div className="skills-market-error">{error}</div>}
        <div><button type="submit" disabled={saving || !serverKey.trim() || (mode === "edit" && !selectedKey)}>{saving ? "Saving..." : mode === "edit" ? "Save changes" : "Add to library"}</button></div>
      </form>
    </div>
  );
}

export function McpConfig({ cwd, onClose }: { cwd: string; onClose: () => void }) {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<Tab>("workspace");
  const [refreshKey, setRefreshKey] = useState(0);
  const [editServerKey, setEditServerKey] = useState<string | null>(null);
  const tabs: { key: Tab; label: string }[] = [{ key: "workspace", label: "Workspace" }, { key: "library", label: "Library" }, { key: "acquire", label: "Acquire" }];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal-surface" style={{ width: isMobile ? "calc(100vw - 16px)" : 860, maxWidth: "calc(100vw - 16px)", height: isMobile ? "calc(100dvh - 16px)" : "78vh", maxHeight: "calc(100dvh - 16px)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, display: "flex", flexDirection: "column", boxShadow: "0 8px 32px rgba(0,0,0,0.18)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}><span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>MCP</span><code style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortenPath(cwd)}</code></div>
          <button type="button" onClick={onClose} aria-label="Close MCP configuration" style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "2px 6px" }}>×</button>
        </div>
        <div style={{ display: "flex", gap: 2, padding: "8px 18px 0", borderBottom: "1px solid var(--border)", flexShrink: 0, background: "var(--bg-panel)" }}>
          {tabs.map((item) => <button key={item.key} type="button" onClick={() => { setTab(item.key); if (item.key === "acquire") setEditServerKey(null); }} style={{ padding: "8px 14px", fontSize: 13, border: "none", borderBottom: tab === item.key ? "2px solid #705ef6" : "2px solid transparent", background: "none", color: tab === item.key ? "var(--text)" : "var(--text-dim)", cursor: "pointer", fontWeight: tab === item.key ? 600 : 400 }}>{item.label}</button>)}
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          {tab === "workspace" && <WorkspaceTab cwd={cwd} refreshKey={refreshKey} isMobile={isMobile} onClose={onClose} />}
          {tab === "library" && <LibraryTab refreshKey={refreshKey} onEdit={(serverKey) => { setEditServerKey(serverKey); setTab("acquire"); }} />}
          {tab === "acquire" && <AcquireTab editServerKey={editServerKey} onSaved={() => { setRefreshKey((key) => key + 1); setEditServerKey(null); setTab("library"); }} />}
        </div>
      </div>
    </div>
  );
}
