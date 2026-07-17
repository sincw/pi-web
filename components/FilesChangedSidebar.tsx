"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { joinFilePath } from "@/lib/file-paths";
import { getFileIcon } from "./FileIcons";
import { sumChanges, type ChangedFile, type DiffSection } from "@/lib/git-diff-parse";

interface DiffListPayload {
  staged?: ChangedFile[];
  unstaged?: ChangedFile[];
  notGit?: boolean;
  error?: string;
}

interface DiffFilePayload {
  oldContent?: string;
  newContent?: string;
  error?: string;
}

interface OpenDiffArgs {
  filePath: string;
  fileName: string;
  oldContent: string;
  newContent: string;
  section: DiffSection;
}

interface Props {
  cwd: string | null;
  onOpenFile: (filePath: string, fileName: string) => void;
  onOpenDiffFile: (args: OpenDiffArgs) => void;
}

const STATUS_COLORS: Record<string, string> = {
  M: "#eab308", // yellow — modified
  A: "#4ade80", // green — added
  D: "#f87171", // red — deleted
  R: "#60a5fa", // blue — renamed/copied (destination shown as R)
  U: "#9ca3af", // gray — untracked
};

function ChangeStat({ added, deleted }: { added: number; deleted: number }) {
  const show = added > 0 || deleted > 0;
  if (!show) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontVariantNumeric: "tabular-nums" }}>
      {added > 0 && <span style={{ color: "#4ade80" }}>+{added}</span>}
      {deleted > 0 && <span style={{ color: "#f87171" }}>-{deleted}</span>}
    </span>
  );
}

const headerBtnStyle = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 26, height: 26, padding: 0, marginRight: 6,
  background: "none", border: "none", color: "var(--text-dim)",
  cursor: "pointer", borderRadius: 5, flexShrink: 0,
  transition: "color 0.3s, background 0.3s",
} as const;

// Section sub-header: one size smaller than the parent "Git" header
// (11px uppercased vs 10px camelcase here) and shorter, so the panel reads
// as parent → child rather than two sibling headers.
const sectionHeaderStyle = {
  display: "flex", alignItems: "center", flexShrink: 0,
  padding: "2px 10px 2px 22px",
  color: "var(--text-muted)", fontSize: 10, fontWeight: 600,
  letterSpacing: 0,
} as const;

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}>
      <polyline points="3 2 7 5 3 8" />
    </svg>
  );
}

function Section({
  title, section, files, collapsed, onToggle, onOpen,
}: {
  title: string;
  section: DiffSection;
  files: ChangedFile[];
  collapsed: boolean;
  onToggle: () => void;
  onOpen: (f: ChangedFile, section: DiffSection) => void;
}) {
  const totals = sumChanges(files);
  return (
    <div>
      <button
        onClick={onToggle}
        style={{ ...sectionHeaderStyle, background: "none", border: "none", cursor: "pointer", textAlign: "left", width: "100%" }}
        title={`${title} (${files.length})`}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 5, flex: 1 }}>
          <svg width="8" height="8" viewBox="0 0 10 10" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: !collapsed ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}>
            <polyline points="3 2 7 5 3 8" />
          </svg>
          {title}
          <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>
            {files.length}
          </span>
        </span>
        <span style={{ display: "flex", marginLeft: "auto", paddingRight: 4 }}>
          <ChangeStat added={totals.added} deleted={totals.deleted} />
        </span>
      </button>
      {!collapsed && (
        <div>
          {files.length === 0 ? (
            <div style={{ padding: "4px 12px 4px 22px", fontSize: 11, color: "var(--text-dim)" }}>
              No changes
            </div>
          ) : (
            files.map((file) => {
              const fileName = file.path.split("/").pop() ?? file.path;
              return (
                <div
                  key={`${file.path}#${section}`}
                  onClick={() => onOpen(file, section)}
                  title={`${file.path} (${file.status})`}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    paddingLeft: 22, paddingRight: 8, height: 24,
                    cursor: "pointer", color: "var(--text)",
                    userSelect: "none",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.borderRadius = "4px"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{
                    width: 12, textAlign: "center", fontSize: 11, fontWeight: 700, flexShrink: 0,
                    color: STATUS_COLORS[file.status] || "var(--text-dim)", fontFamily: "var(--font-mono)",
                  }}>
                    {file.status}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                    {getFileIcon(fileName, 14)}
                  </span>
                  <span
                    style={{
                      fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      flex: 1,
                    }}
                    title={file.path}
                  >
                    {fileName}
                  </span>
                  <ChangeStat added={file.added} deleted={file.deleted} />
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export function FilesChangedSidebar({ cwd, onOpenFile, onOpenDiffFile }: Props) {
  const [staged, setStaged] = useState<ChangedFile[]>([]);
  const [unstaged, setUnstaged] = useState<ChangedFile[]>([]);
  const [notGit, setNotGit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedStaged, setCollapsedStaged] = useState(false);
  const [collapsedUnstaged, setCollapsedUnstaged] = useState(false);
  const [loadKey, setLoadKey] = useState(0);
  const [refreshDone, setRefreshDone] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevCwdRef = useRef<string | null>(null);

  const fetchDiff = useCallback(async () => {
    if (!cwd) { setStaged([]); setUnstaged([]); setNotGit(false); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/git-diff?cwd=${encodeURIComponent(cwd)}`);
      if (!res.ok) { setError(`HTTP ${res.status}`); setNotGit(false); return; }
      const data = await res.json() as DiffListPayload;
      if (data.notGit) { setNotGit(true); setStaged([]); setUnstaged([]); return; }
      setNotGit(false);
      if (data.error) { setError(data.error); setStaged([]); setUnstaged([]); return; }
      setStaged(data.staged ?? []);
      setUnstaged(data.unstaged ?? []);
    } catch (e) {
      setError(String(e)); setStaged([]); setUnstaged([]); setNotGit(false);
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    if (cwd !== prevCwdRef.current) {
      prevCwdRef.current = cwd;
      setLoadKey((k) => k + 1);
    }
  }, [cwd]);

  useEffect(() => {
    fetchDiff();
    if (!cwd || collapsed) return;
    const id = setInterval(fetchDiff, 5000);
    return () => clearInterval(id);
  }, [loadKey, fetchDiff, cwd, collapsed]);

  const triggerRefresh = useCallback(() => {
    setLoadKey((k) => k + 1);
    setRefreshDone(true);
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => setRefreshDone(false), 2000);
  }, []);

  useEffect(() => () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
  }, []);

  const handleFileClick = useCallback(
    async (file: ChangedFile, section: DiffSection) => {
      if (!cwd) return;
      const fullPath = joinFilePath(cwd, file.path);
      const fileName = file.path.split("/").pop() ?? file.path;
      try {
        const sourceParam = file.sourcePath ? `&source=${encodeURIComponent(file.sourcePath)}` : "";
        const res = await fetch(
          `/api/git-diff?cwd=${encodeURIComponent(cwd)}&file=${encodeURIComponent(file.path)}&section=${section}${sourceParam}`,
        );
        if (!res.ok) { onOpenFile(fullPath, fileName); return; }
        const data = await res.json() as DiffFilePayload;
        if (data.error || data.oldContent === undefined || data.newContent === undefined) {
          onOpenFile(fullPath, fileName); return;
        }
        onOpenDiffFile({
          filePath: fullPath,
          fileName,
          oldContent: data.oldContent,
          newContent: data.newContent,
          section,
        });
      } catch {
        onOpenFile(fullPath, fileName);
      }
    },
    [cwd, onOpenFile, onOpenDiffFile],
  );

  const renderRefresh = refreshDone
    ? (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    )
    : (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
      </svg>
    );

  // No working folder chosen → Git panel hidden, mirroring Explorer's guard.
  if (!cwd) return null;

  const showStaged = staged.length > 0;
  const total = staged.length + unstaged.length;

  return (
    <div
      style={{
        borderTop: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
        <button
          onClick={() => setCollapsed((v) => !v)}
          style={{
            display: "flex", alignItems: "center", gap: 6, flex: 1,
            padding: "6px 10px",
            background: "none", border: "none", color: "var(--text-muted)",
            cursor: "pointer", fontSize: 11, fontWeight: 600,
            letterSpacing: "0.05em", textTransform: "uppercase", textAlign: "left",
          }}
        >
          <ChevronIcon open={!collapsed} />
          Git
          {total > 0 && (
            <span style={{ color: "var(--text-dim)", fontWeight: 400, letterSpacing: 0 }}>
              {total}
            </span>
          )}
        </button>
        <button
          onClick={triggerRefresh}
          title="Refresh git changes"
          style={headerBtnStyle}
          onMouseEnter={(e) => { if (refreshDone) return; e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
          onMouseLeave={(e) => { if (refreshDone) return; e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.background = "none"; }}
        >
          {renderRefresh}
        </button>
      </div>
      {!collapsed && (
        <div style={{ maxHeight: "40vh", overflowY: "auto", overflowX: "hidden", padding: "2px 4px" }}>
          {error && (
            <div style={{ padding: "4px 12px 4px 22px", fontSize: 11, color: "#f87171" }}>
              {error}
            </div>
          )}
          {notGit ? (
            <div style={{ padding: "4px 12px 4px 22px", fontSize: 11, color: "var(--text-dim)" }}>
              Not a Git repository
            </div>
          ) : loading && total === 0 ? (
            <div style={{ padding: "4px 12px 4px 22px", fontSize: 11, color: "var(--text-dim)" }}>
              Loading...
            </div>
          ) : !error && total === 0 ? (
            <div style={{ padding: "4px 12px 4px 22px", fontSize: 11, color: "var(--text-dim)" }}>
              No uncommitted changes
            </div>
          ) : (
            <>
              {showStaged && (
                <Section
                  title="Staged Changes" section="staged" files={staged}
                  collapsed={collapsedStaged} onToggle={() => setCollapsedStaged((v) => !v)}
                  onOpen={handleFileClick}
                />
              )}
              <Section
                title="Changes" section="unstaged" files={unstaged}
                collapsed={collapsedUnstaged} onToggle={() => setCollapsedUnstaged((v) => !v)}
                onOpen={handleFileClick}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}