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
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-surface"
        style={{
          width: isMobile ? "calc(100vw - 16px)" : 900,
          maxWidth: "calc(100vw - 16px)",
          height: isMobile ? "calc(100dvh - 16px)" : "78vh",
          maxHeight: "calc(100dvh - 16px)",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 18px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Skill Packs</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 20 }}
          >
            ×
          </button>
        </div>

        {error && (
          <div style={{ padding: "8px 18px", fontSize: 12, color: "#f87171", borderBottom: "1px solid var(--border)" }}>
            {error}
          </div>
        )}

        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          <ManageTab
            packs={packs}
            librarySkills={librarySkills}
            selectedId={selectedId}
            detail={detail}
            loading={loading}
            isMobile={isMobile}
            onSelect={setSelectedId}
            onCreate={createPack}
            onSave={savePack}
            onDelete={deletePack}
          />
        </div>
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
  isMobile,
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
  isMobile: boolean;
  onSelect: (id: string | null) => void;
  onCreate: () => void;
  onSave: (form: PackForm) => void;
  onDelete: () => void;
}) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: isMobile ? "column" : "row", overflow: "hidden" }}>
      {/* Left: pack cards */}
      <div
        style={{
          width: isMobile ? "100%" : 260,
          borderRight: isMobile ? "none" : "1px solid var(--border)",
          borderBottom: isMobile ? "1px solid var(--border)" : "none",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          background: "var(--bg-panel)",
          overflow: "hidden",
        }}
      >
        <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
            {packs.map((p) => {
              const active = selectedId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => onSelect(p.id)}
                  style={{
                    textAlign: "left",
                    padding: 12,
                    borderRadius: 8,
                    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                    background: active ? "rgba(37,99,235,0.08)" : "var(--bg)",
                    cursor: "pointer",
                    color: "var(--text)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    minHeight: 70,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                    {p.skillCount} skill{p.skillCount === 1 ? "" : "s"}
                  </div>
                  {p.description && <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>{p.description}</div>}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
          <button
            onClick={() => void onCreate()}
            disabled={loading}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "none",
              color: "var(--text-dim)",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: 12,
            }}
          >
            + New pack
          </button>
        </div>
      </div>

      {/* Right: editor */}
      <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
        {!detail ? (
          <div style={{ color: "var(--text-dim)", fontSize: 13 }}>Select a pack to edit</div>
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
      </div>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Pack name"
        style={{
          padding: "8px 10px",
          fontSize: 14,
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          color: "var(--text)",
          outline: "none",
        }}
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description"
        rows={2}
        style={{
          padding: "8px 10px",
          fontSize: 13,
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          color: "var(--text)",
          outline: "none",
          resize: "none",
        }}
      />

      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10 }}>Skills</div>
        {skills.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>No skills in this pack</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, marginBottom: 10 }}>
            {skills.map((s, idx) => {
              const meta = detail.skills.find((d) => d.skillKey === s.skillKey);
              const current = librarySkills.find((l) => l.skillKey.toLowerCase() === s.skillKey.toLowerCase());
              const isStale = current && current.contentHash !== s.contentHash;
              const expanded = expandedSkill === s.skillKey;
              return (
                <div
                  key={s.skillKey}
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--bg-panel)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>{meta?.name || s.skillKey}</span>
                    <button
                      onClick={() => setSkills((prev) => prev.filter((_, i) => i !== idx))}
                      style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 11, padding: 0 }}
                    >
                      ×
                    </button>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                    {s.skillKey} · {shortHash(s.contentHash)}
                  </div>
                  {isStale && <div style={{ fontSize: 10, color: "#d97706" }}>引用需更新</div>}
                  {expanded && meta?.description && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{meta.description}</div>
                  )}
                  <button
                    onClick={() => setExpandedSkill(expanded ? null : s.skillKey)}
                    style={{
                      marginTop: 4,
                      alignSelf: "flex-start",
                      fontSize: 10,
                      color: "var(--accent)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    {expanded ? "Hide details" : "Details"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {!showAdd ? (
          <button
            onClick={() => setShowAdd(true)}
            style={{
              padding: "6px 12px",
              border: "1px solid var(--border)",
              borderRadius: 6,
              background: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            + Add skill
          </button>
        ) : availableSkills.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>No available library skills</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
            {availableSkills.map((s) => (
              <button
                key={s.skillKey}
                onClick={() => {
                  setSkills((prev) => [...prev, { skillKey: s.skillKey, contentHash: s.contentHash }]);
                  setShowAdd(false);
                }}
                style={{
                  textAlign: "left",
                  padding: 10,
                  borderRadius: 8,
                  border: "1px dashed var(--border)",
                  background: "var(--bg-panel)",
                  color: "var(--text)",
                  cursor: "pointer",
                  fontSize: 13,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <span style={{ fontWeight: 500 }}>{s.name}</span>
                <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{s.skillKey}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: "auto", paddingTop: 10 }}>
        <button
          onClick={() => onSave({ name, description, skills })}
          disabled={saving || !name.trim()}
          style={{
            padding: "7px 16px",
            borderRadius: 6,
            border: "none",
            background: "var(--accent)",
            color: "#fff",
            cursor: saving || !name.trim() ? "not-allowed" : "pointer",
            opacity: saving || !name.trim() ? 0.5 : 1,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={onDelete}
          disabled={saving}
          style={{
            padding: "7px 16px",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "none",
            color: "#f87171",
            cursor: saving ? "not-allowed" : "pointer",
            fontSize: 13,
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
