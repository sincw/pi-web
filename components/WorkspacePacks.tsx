"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import type {
  AppliedPackInfo,
  ApplyPreviewResponse,
  McpAdapterStatusInfo,
  SkillPackInfo,
} from "@/lib/api-types";

export function WorkspacePacks({
  cwd,
  onApplied,
  refreshKey,
}: {
  cwd: string;
  onApplied: () => void;
  refreshKey?: number;
}) {
  const [applied, setApplied] = useState<AppliedPackInfo[]>([]);
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const [skipped, setSkipped] = useState<{ packId: string; skillKey?: string; serverKey?: string; reason: string }[]>([]);
  const [packs, setPacks] = useState<SkillPackInfo[]>([]);
  const [adapter, setAdapter] = useState<McpAdapterStatusInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [preview, setPreview] = useState<ApplyPreviewResponse | null>(null);
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    try {
      const [wsRes, packsRes, adapterRes] = await Promise.all([
        fetch(`/api/workspace-skill-packs?cwd=${encodeURIComponent(cwd)}`),
        fetch("/api/skill-packs"),
        fetch(`/api/mcp/status?cwd=${encodeURIComponent(cwd)}`),
      ]);
      const ws = (await wsRes.json()) as {
        appliedPacks?: AppliedPackInfo[];
        skippedConflicts?: { packId: string; skillKey?: string; serverKey?: string; reason: string }[];
        revision?: number;
        error?: string;
      };
      const p = (await packsRes.json()) as { packs?: SkillPackInfo[]; error?: string };
      const adapterData = (await adapterRes.json()) as McpAdapterStatusInfo & { error?: string };
      if (ws.error) throw new Error(ws.error);
      if (p.error) throw new Error(p.error);
      setApplied(ws.appliedPacks ?? []);
      setWorkspaceRevision(ws.revision ?? 0);
      setSkipped(ws.skippedConflicts ?? []);
      setPacks(p.packs ?? []);
      setAdapter(adapterData.error ? null : adapterData);
    } catch (e) {
      setError(String(e));
    }
  }, [cwd]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    void load().finally(() => setLoading(false));
  }, [load, refreshKey]);

  const removeTag = async (packId: string) => {
    try {
      const pack = applied.find((item) => item.packId === packId);
      if (pack?.receipt.mcpServers.length && adapter?.state !== "ready") {
        throw new Error(`MCP adapter is ${adapter?.state ?? "unavailable"}; enable ${adapter?.package ?? "npm:pi-mcp-adapter"} before removing this Pack.`);
      }
      const res = await fetch(`/api/workspace-skill-packs?cwd=${encodeURIComponent(cwd)}&packId=${encodeURIComponent(packId)}&workspaceRevision=${workspaceRevision}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (data.error) throw new Error(data.error);
      await load();
      onApplied();
    } catch (e) {
      setError(String(e));
    }
  };

  const runPreview = async (packIds: string[]) => {
    const res = await fetch("/api/workspace-skill-packs/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cwd, packIds }),
    });
    const data = (await res.json()) as ApplyPreviewResponse & { error?: string };
    if (data.error) throw new Error(data.error);
    return data;
  };

  const runApply = async (packIds: string[], confirmedPlan: ApplyPreviewResponse) => {
    const res = await fetch("/api/workspace-skill-packs/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cwd, packIds, workspaceRevision: confirmedPlan.workspaceRevision }),
    });
    const data = (await res.json()) as { success?: boolean; error?: string };
    if (data.error) throw new Error(data.error);
  };

  const unusedPacks = packs.filter((pack) => !applied.some((item) => item.packId === pack.id));
  const hasMcpPacks = applied.some((pack) => pack.receipt.mcpServers.length > 0) || packs.some((pack) => pack.mcpServerCount > 0);

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>Applied packs:</span>
        {loading && <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Loading…</span>}
        {applied.map((pack) => {
          const skippedHere = skipped.filter((item) => item.packId === pack.packId);
          return (
            <span
              key={pack.packId}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 12, fontSize: 12,
                background: pack.status === "partial" ? "rgba(217,119,6,0.12)" : "rgba(34,197,94,0.10)",
                color: pack.status === "partial" ? "#d97706" : "#16a34a",
                border: `1px solid ${pack.status === "partial" ? "rgba(217,119,6,0.3)" : "rgba(34,197,94,0.3)"}`,
              }}
              title={skippedHere.map((item) => `${item.skillKey ?? item.serverKey ?? "entry"} skipped`).join("\n")}
            >
              {pack.packName || pack.packId}
              {pack.status === "partial" && <span style={{ fontSize: 10, fontWeight: 600 }}>· 有跳过</span>}
              <button onClick={() => void removeTag(pack.packId)} aria-label={`Remove ${pack.packName || pack.packId}`} style={{ display: "grid", placeItems: "center", background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}><X size={13} aria-hidden="true" /></button>
            </span>
          );
        })}
        {unusedPacks.length > 0 && (
          <button
            onClick={() => setPicking(true)}
            style={{ padding: "3px 10px", borderRadius: 12, border: "1px dashed var(--border)", background: "none", color: "var(--text-muted)", fontSize: 12, cursor: "pointer" }}
          >
            + Apply pack
          </button>
        )}
        {hasMcpPacks && adapter && (
          <span style={{ fontSize: 11, color: adapter.state === "ready" ? "#16a34a" : "#d97706" }}>
            MCP adapter: {adapter.state}{adapter.version ? ` (${adapter.version})` : ""}
          </span>
        )}
      </div>
      {error && <div style={{ fontSize: 12, color: "#f87171", marginTop: 6 }}>{error}</div>}

      {picking && (
        <PackPicker
          packs={unusedPacks}
          onPreview={async (ids) => {
            setError(null);
            try {
              setPreview(await runPreview([...applied.map((pack) => pack.packId), ...ids]));
            } catch (e) {
              setError(String(e));
              setPreview(null);
            }
          }}
          onApply={async (ids) => {
            setApplying(true);
            setError(null);
            try {
              if (!preview?.canApply) throw new Error("No confirmed preview to apply");
              await runApply([...applied.map((pack) => pack.packId), ...ids], preview);
              await load();
              onApplied();
              setPicking(false);
              setPreview(null);
            } catch (e) {
              setError(String(e));
            } finally {
              setApplying(false);
            }
          }}
          onClose={() => {
            setPicking(false);
            setPreview(null);
          }}
          preview={preview}
          applying={applying}
          adapter={adapter}
        />
      )}
    </div>
  );
}

function PackPicker({
  packs,
  onPreview,
  onApply,
  onClose,
  preview,
  applying,
  adapter,
}: {
  packs: SkillPackInfo[];
  onPreview: (ids: string[]) => void;
  onApply: (ids: string[]) => void;
  onClose: () => void;
  preview: ApplyPreviewResponse | null;
  applying: boolean;
  adapter: McpAdapterStatusInfo | null;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const mcpChange = Boolean(preview?.mcpRelevant);
  const adapterBlocked = mcpChange && adapter !== null && adapter.state !== "ready";

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div style={{ width: 420, maxWidth: "calc(100vw - 24px)", maxHeight: "80vh", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: 18, display: "flex", flexDirection: "column", gap: 14, overflow: "auto" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Apply Packs</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {packs.map((pack) => {
            const checked = selected.has(pack.id);
            return (
              <label key={pack.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", cursor: "pointer", background: checked ? "var(--bg-selected)" : "var(--bg-panel)" }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    const next = new Set(selected);
                    if (event.target.checked) next.add(pack.id);
                    else next.delete(pack.id);
                    setSelected(next);
                  }}
                />
                <div>
                  <div style={{ fontSize: 13, color: "var(--text)" }}>{pack.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                    {pack.skillCount} skill{pack.skillCount === 1 ? "" : "s"}
                    {pack.mcpServerCount > 0 && ` · ${pack.mcpServerCount} MCP`}
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        {preview && (
          <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: 6 }}>
            {!preview.canApply && (
              <div style={{ color: "#f87171" }}>
                Cannot apply: {preview.blocked.length > 0 && `${preview.blocked.length} blocked`}{" "}
                {preview.versionConflicts.length > 0 && `${preview.versionConflicts.length} version conflict(s)`}
              </div>
            )}
            {preview.toInstall.length > 0 && <div>Will install: {preview.toInstall.map((item) => item.skillKey).join(", ")}</div>}
            {preview.skipped.length > 0 && (
              <div style={{ color: "#d97706" }}>
                Will skip: {preview.skipped.map((item) => item.skillKey).join(", ")}
              </div>
            )}
            {(preview.mcp.toConfigure.length > 0 || preview.mcp.skipped.length > 0) && (
              <div>
                {preview.mcp.toConfigure.length > 0 && `Will configure MCP: ${preview.mcp.toConfigure.map((item) => item.serverKey).join(", ")}`}
                {preview.mcp.skipped.length > 0 && ` Will skip MCP: ${preview.mcp.skipped.map((item) => item.serverKey).join(", ")}`}
              </div>
            )}
            {(preview.mcp.blocked.length > 0 || preview.mcp.versionConflicts.length > 0) && (
              <div style={{ color: "#f87171" }}>
                Cannot configure MCP: {preview.mcp.blocked.length + preview.mcp.versionConflicts.length} conflict(s)
              </div>
            )}
          </div>
        )}
        {adapterBlocked && (
          <div style={{ fontSize: 12, color: "#f87171" }}>
            MCP adapter is {adapter?.state}. Enable {adapter?.package} before applying MCP changes.
          </div>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 13 }}
          >
            Cancel
          </button>
          <button
            onClick={() => onPreview(Array.from(selected))}
            disabled={selected.size === 0}
            style={{ padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-panel)", color: "var(--text)", cursor: selected.size === 0 ? "not-allowed" : "pointer", opacity: selected.size === 0 ? 0.5 : 1, fontSize: 13 }}
          >
            Preview
          </button>
          <button
            onClick={() => onApply(Array.from(selected))}
            disabled={!preview?.canApply || applying || adapterBlocked}
            style={{ padding: "6px 14px", border: "none", borderRadius: 6, background: "var(--accent)", color: "#fff", cursor: !preview?.canApply || applying || adapterBlocked ? "not-allowed" : "pointer", opacity: !preview?.canApply || applying || adapterBlocked ? 0.5 : 1, fontSize: 13, fontWeight: 600 }}
          >
            {applying ? "Applying…" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}
