"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import type {
  LibrarySkillInfo,
  LibraryMcpServerInfo,
  SkillPackInfo,
} from "@/lib/api-types";

interface PackDetail {
  id: string;
  name: string;
  description: string;
  skills: LibrarySkillInfo[];
  mcpServers: LibraryMcpServerInfo[];
}

interface PackForm {
  name: string;
  description: string;
  skills: { skillKey: string; contentHash: string }[];
  mcpServers: { serverKey: string; configHash: string }[];
}

export function SkillPacksModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const [packs, setPacks] = useState<SkillPackInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PackDetail | null>(null);
  const [librarySkills, setLibrarySkills] = useState<LibrarySkillInfo[]>([]);
  const [libraryMcpServers, setLibraryMcpServers] = useState<LibraryMcpServerInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPacks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [packsRes, libRes] = await Promise.all([
        fetch("/api/skill-packs"),
        fetch("/api/skill-library"),
      ]);
      const packsData = (await packsRes.json()) as { packs?: SkillPackInfo[]; error?: string };
      const libData = (await libRes.json()) as { libraryRoot?: string | null; skills?: LibrarySkillInfo[]; mcpServers?: LibraryMcpServerInfo[]; error?: string };
      if (packsData.error) throw new Error(packsData.error);
      if (libData.error) throw new Error(libData.error);
      setPacks(packsData.packs ?? []);
      setLibrarySkills(libData.skills ?? []);
      setLibraryMcpServers(libData.mcpServers ?? []);
      if ((packsData.packs ?? []).length > 0 && !selectedId) {
        setSelectedId(packsData.packs![0].id);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/skill-packs/${encodeURIComponent(id)}`);
      const data = (await res.json()) as PackDetail & { error?: string };
      if (data.error) throw new Error(data.error);
      setDetail(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPacks();
  }, [loadPacks]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const createPack = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/skill-packs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Pack", description: "" }),
      });
      const data = (await res.json()) as { pack?: SkillPackInfo; error?: string };
      if (data.error) throw new Error(data.error);
      if (data.pack) {
        setPacks((prev) => [...prev, data.pack!]);
        setSelectedId(data.pack.id);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const savePack = async (form: PackForm) => {
    if (!selectedId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/skill-packs/${encodeURIComponent(selectedId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { pack?: SkillPackInfo; error?: string };
      if (data.error) throw new Error(data.error);
      setPacks((prev) =>
        prev.map((p) =>
          p.id === selectedId
            ? { ...p, name: form.name, description: form.description, skillCount: form.skills.length, mcpServerCount: form.mcpServers.length }
            : p,
        ),
      );
      await loadDetail(selectedId);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const deletePack = async () => {
    if (!selectedId) return;
    if (!confirm(`Delete pack "${detail?.name}"?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/skill-packs/${encodeURIComponent(selectedId)}`, { method: "DELETE" });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (data.error) throw new Error(data.error);
      setPacks((prev) => prev.filter((p) => p.id !== selectedId));
      setSelectedId(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="skill-packs-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-surface skill-packs-modal"
        style={{
          width: isMobile ? "calc(100vw - 16px)" : 860,
          maxWidth: "calc(100vw - 16px)",
          height: isMobile ? "calc(100dvh - 16px)" : "78vh",
          maxHeight: "calc(100dvh - 16px)",
        }}
      >
        <header className="skill-packs-modal-header">
          <div>
            <h2>Skill Packs</h2>
            <span>{packs.length} pack{packs.length === 1 ? "" : "s"}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="skill-packs-close"
            title="Close skill packs"
            aria-label="Close skill packs"
          >
            ×
          </button>
        </header>

        {error && (
          <div className="skill-packs-error">{error}</div>
        )}

        <ManageTab
          packs={packs}
          librarySkills={librarySkills}
          libraryMcpServers={libraryMcpServers}
          selectedId={selectedId}
          detail={detail}
          loading={loading}
          onSelect={setSelectedId}
          onCreate={createPack}
          onSave={savePack}
          onDelete={deletePack}
        />
      </div>
    </div>
  );
}

function ManageTab({
  packs,
  librarySkills,
  libraryMcpServers,
  selectedId,
  detail,
  loading,
  onSelect,
  onCreate,
  onSave,
  onDelete,
}: {
  packs: SkillPackInfo[];
  librarySkills: LibrarySkillInfo[];
  libraryMcpServers: LibraryMcpServerInfo[];
  selectedId: string | null;
  detail: PackDetail | null;
  loading: boolean;
  onSelect: (id: string | null) => void;
  onCreate: () => void;
  onSave: (form: PackForm) => void;
  onDelete: () => void;
}) {
  const [query, setQuery] = useState("");
  const visiblePacks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return packs;
    return packs.filter((pack) =>
      [pack.name, pack.description].some((value) => value.toLowerCase().includes(normalizedQuery)),
    );
  }, [packs, query]);

  return (
    <div className="skill-packs-layout">
      <aside className="skill-packs-sidebar">
        <div className="skill-packs-sidebar-toolbar">
          <div className="skill-packs-sidebar-heading">
            <span>Packs</span>
            <span>{packs.length}</span>
          </div>
          <label className="sr-only" htmlFor="skill-pack-search">Search packs</label>
          <div className="skill-packs-search">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m16 16 4 4" />
            </svg>
            <input
              id="skill-pack-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search packs"
            />
          </div>
        </div>

        <div className="skill-packs-list">
          {visiblePacks.length === 0 ? (
            <p className="skill-packs-list-empty">
              {packs.length === 0 ? "No packs yet" : "No matching packs"}
            </p>
          ) : (
            visiblePacks.map((pack) => {
              const active = selectedId === pack.id;
              return (
                <button
                  key={pack.id}
                  type="button"
                  className={`skill-pack-list-card${active ? " active" : ""}`}
                  onClick={() => onSelect(pack.id)}
                >
                  <span className="skill-pack-list-mark" aria-hidden="true">
                    {pack.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="skill-pack-list-copy">
                    <strong>{pack.name}</strong>
                    <span>
                      {pack.skillCount} skill{pack.skillCount === 1 ? "" : "s"}
                      {pack.mcpServerCount > 0 && ` · ${pack.mcpServerCount} MCP`}
                    </span>
                    {pack.description && <small>{pack.description}</small>}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="skill-packs-sidebar-footer">
          <button type="button" className="skill-packs-new" onClick={() => void onCreate()} disabled={loading}>
            + New pack
          </button>
        </div>
      </aside>

      <main className="skill-packs-editor">
        {!detail ? (
          <div className="skill-packs-editor-empty">
            {loading ? "Loading packs..." : "Select a pack to edit"}
          </div>
        ) : (
          <PackEditor
            key={detail.id}
            detail={detail}
            librarySkills={librarySkills}
            libraryMcpServers={libraryMcpServers}
            saving={loading}
            onSave={onSave}
            onDelete={onDelete}
          />
        )}
      </main>
    </div>
  );
}

function PackEditor({
  detail,
  librarySkills,
  libraryMcpServers,
  saving,
  onSave,
  onDelete,
}: {
  detail: PackDetail;
  librarySkills: LibrarySkillInfo[];
  libraryMcpServers: LibraryMcpServerInfo[];
  saving: boolean;
  onSave: (form: PackForm) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(detail.name);
  const [description, setDescription] = useState(detail.description);
  const [skills, setSkills] = useState<{ skillKey: string; contentHash: string }[]>(
    detail.skills.map((s) => ({ skillKey: s.skillKey, contentHash: s.contentHash })),
  );
  const [mcpServers, setMcpServers] = useState<{ serverKey: string; configHash: string }[]>(
    detail.mcpServers.map((server) => ({ serverKey: server.serverKey, configHash: server.configHash })),
  );

  useEffect(() => {
    setName(detail.name);
    setDescription(detail.description);
    setSkills(detail.skills.map((s) => ({ skillKey: s.skillKey, contentHash: s.contentHash })));
    setMcpServers(detail.mcpServers.map((server) => ({ serverKey: server.serverKey, configHash: server.configHash })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.id]);

  const availableSkills = useMemo(() => {
    const used = new Set(skills.map((s) => s.skillKey.toLowerCase()));
    return librarySkills.filter((s) => !used.has(s.skillKey.toLowerCase()));
  }, [skills, librarySkills]);
  const availableMcpServers = useMemo(() => {
    const used = new Set(mcpServers.map((server) => server.serverKey.toLowerCase()));
    return libraryMcpServers.filter((server) => !used.has(server.serverKey.toLowerCase()));
  }, [mcpServers, libraryMcpServers]);

  return (
    <div className="skill-pack-form">
      <div className="skill-pack-form-fields">
        <label>
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Pack name" />
        </label>
        <label>
          <span>Description</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Describe this pack"
            rows={2}
          />
        </label>
      </div>

      <section className="skill-pack-section">
        <div className="skill-pack-section-heading">
          <span>Included skills</span>
          <span>{skills.length}</span>
        </div>
        {skills.length === 0 ? (
          <p className="skill-pack-empty">No skills in this pack</p>
        ) : (
          <div className="skill-pack-item-list">
            {skills.map((s, idx) => {
              const current = librarySkills.find((l) => l.skillKey.toLowerCase() === s.skillKey.toLowerCase());
              return (
                <article key={s.skillKey} className="skill-pack-item">
                  <div className="skill-pack-item-header">
                    <span className="skill-pack-item-name">{current?.name || s.skillKey}</span>
                    <button
                      type="button"
                      className="skill-pack-remove"
                      onClick={() => setSkills((prev) => prev.filter((_, i) => i !== idx))}
                      disabled={saving}
                      title={`Remove ${current?.name || s.skillKey}`}
                      aria-label={`Remove ${current?.name || s.skillKey}`}
                    >
                      ×
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <label className="skill-pack-select"><span className="sr-only">Add skill from library</span><select value="" onChange={(event) => { const skill = availableSkills.find((item) => item.skillKey === event.target.value); if (skill) setSkills((current) => [...current, { skillKey: skill.skillKey, contentHash: skill.contentHash }]); }} disabled={saving || availableSkills.length === 0}><option value="">{availableSkills.length ? "+ Add skill" : "No available skills"}</option>{availableSkills.map((skill) => <option key={skill.skillKey} value={skill.skillKey}>{skill.name}</option>)}</select></label>
      </section>

      <section className="skill-pack-section">
        <div className="skill-pack-section-heading">
          <span>MCP servers</span>
          <span>{mcpServers.length}</span>
        </div>
        {mcpServers.length === 0 ? (
          <p className="skill-pack-empty">No MCP servers in this pack</p>
        ) : (
          <div className="skill-pack-item-list">
            {mcpServers.map((server, index) => {
              const current = libraryMcpServers.find((item) => item.serverKey.toLowerCase() === server.serverKey.toLowerCase());
              return (
                <article key={server.serverKey} className="skill-pack-item">
                  <div className="skill-pack-item-header">
                    <span className="skill-pack-item-name">{current?.name || server.serverKey}</span>
                    <button type="button" className="skill-pack-remove" onClick={() => setMcpServers((items) => items.filter((_, i) => i !== index))} disabled={saving} title={`Remove ${current?.name || server.serverKey}`} aria-label={`Remove ${current?.name || server.serverKey}`}>×</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <label className="skill-pack-select"><span className="sr-only">Add MCP server from library</span><select value="" onChange={(event) => { const server = availableMcpServers.find((item) => item.serverKey === event.target.value); if (server) setMcpServers((current) => [...current, { serverKey: server.serverKey, configHash: server.configHash }]); }} disabled={saving || availableMcpServers.length === 0}><option value="">{availableMcpServers.length ? "+ Add MCP server" : "No available MCP servers"}</option>{availableMcpServers.map((server) => <option key={server.serverKey} value={server.serverKey}>{server.name}</option>)}</select></label>
      </section>

      <footer className="skill-pack-actions">
        <button
          type="button"
          className="skill-pack-save"
          onClick={() => onSave({ name, description, skills, mcpServers })}
          disabled={saving || !name.trim()}
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          className="skill-pack-delete"
          onClick={onDelete}
          disabled={saving}
        >
          Delete
        </button>
      </footer>
    </div>
  );
}
