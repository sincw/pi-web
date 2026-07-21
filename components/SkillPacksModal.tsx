"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import type {
  LibrarySkillInfo,
  SkillPackInfo,
} from "@/lib/api-types";

interface PackDetail {
  id: string;
  name: string;
  description: string;
  skills: LibrarySkillInfo[];
}

interface PackForm {
  name: string;
  description: string;
  skills: { skillKey: string; contentHash: string }[];
}

function shortHash(hash?: string) {
  return hash ? hash.slice(0, 8) : "";
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
      const libData = (await libRes.json()) as { libraryRoot?: string | null; skills?: LibrarySkillInfo[]; error?: string };
      if (packsData.error) throw new Error(packsData.error);
      if (libData.error) throw new Error(libData.error);
      setPacks(packsData.packs ?? []);
      setLibrarySkills(libData.skills ?? []);
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
            ? { ...p, name: form.name, description: form.description, skillCount: form.skills.length }
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
          width: isMobile ? "calc(100vw - 16px)" : 900,
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
                    <span>{pack.skillCount} skill{pack.skillCount === 1 ? "" : "s"}</span>
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
  saving,
  onSave,
  onDelete,
}: {
  detail: PackDetail;
  librarySkills: LibrarySkillInfo[];
  saving: boolean;
  onSave: (form: PackForm) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(detail.name);
  const [description, setDescription] = useState(detail.description);
  const [skills, setSkills] = useState<{ skillKey: string; contentHash: string }[]>(
    detail.skills.map((s) => ({ skillKey: s.skillKey, contentHash: s.contentHash })),
  );
  const [showAdd, setShowAdd] = useState(false);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);

  useEffect(() => {
    setName(detail.name);
    setDescription(detail.description);
    setSkills(detail.skills.map((s) => ({ skillKey: s.skillKey, contentHash: s.contentHash })));
    setShowAdd(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.id]);

  const availableSkills = useMemo(() => {
    const used = new Set(skills.map((s) => s.skillKey.toLowerCase()));
    return librarySkills.filter((s) => !used.has(s.skillKey.toLowerCase()));
  }, [skills, librarySkills]);

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
          <div className="skill-pack-skill-grid">
            {skills.map((s, idx) => {
              const meta = detail.skills.find((d) => d.skillKey === s.skillKey);
              const current = librarySkills.find((l) => l.skillKey.toLowerCase() === s.skillKey.toLowerCase());
              const isStale = current && current.contentHash !== s.contentHash;
              const expanded = expandedSkill === s.skillKey;
              return (
                <article key={s.skillKey} className="skill-pack-skill-card">
                  <div className="skill-pack-skill-card-header">
                    <span className="skill-pack-skill-mark" aria-hidden="true">
                      {(meta?.name || s.skillKey).slice(0, 1).toUpperCase()}
                    </span>
                    <span className="skill-pack-skill-name">{meta?.name || s.skillKey}</span>
                    <button
                      type="button"
                      className="skill-pack-remove"
                      onClick={() => setSkills((prev) => prev.filter((_, i) => i !== idx))}
                      disabled={saving}
                      title={`Remove ${meta?.name || s.skillKey}`}
                      aria-label={`Remove ${meta?.name || s.skillKey}`}
                    >
                      ×
                    </button>
                  </div>
                  <span className="skill-pack-skill-key">{s.skillKey} · {shortHash(s.contentHash)}</span>
                  {isStale && <span className="skill-pack-stale">Needs refresh</span>}
                  {expanded && meta?.description && (
                    <p className="skill-pack-skill-description">{meta.description}</p>
                  )}
                  {meta?.description && (
                    <button
                      type="button"
                      className="skill-pack-details"
                      onClick={() => setExpandedSkill(expanded ? null : s.skillKey)}
                    >
                      {expanded ? "Hide details" : "Details"}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {!showAdd ? (
          <button
            type="button"
            className="skill-pack-add"
            onClick={() => setShowAdd(true)}
            disabled={saving}
          >
            + Add skill
          </button>
        ) : availableSkills.length === 0 ? (
          <div className="skill-pack-add-panel">
            <div className="skill-pack-add-panel-heading">
              <span>No available library skills</span>
              <button type="button" onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="skill-pack-add-panel">
            <div className="skill-pack-add-panel-heading">
              <span>Add from library</span>
              <button type="button" onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
            <div className="skill-pack-skill-grid">
              {availableSkills.map((skill) => (
                <button
                  key={skill.skillKey}
                  type="button"
                  className="skill-pack-available-card"
                  onClick={() => {
                    setSkills((prev) => [...prev, { skillKey: skill.skillKey, contentHash: skill.contentHash }]);
                    setShowAdd(false);
                  }}
                  disabled={saving}
                >
                  <span className="skill-pack-skill-mark" aria-hidden="true">{skill.name.slice(0, 1).toUpperCase()}</span>
                  <span>
                    <strong>{skill.name}</strong>
                    <small>{skill.skillKey}</small>
                  </span>
                  <span aria-hidden="true">+</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <footer className="skill-pack-actions">
        <button
          type="button"
          className="skill-pack-save"
          onClick={() => onSave({ name, description, skills })}
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
