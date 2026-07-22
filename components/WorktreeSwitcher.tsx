"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GitBranch } from "@/lib/git-branches";

interface WorktreeEntry {
  path: string;
  branch: string | null;
  isMain: boolean;
}

interface WorktreeState {
  projectRoot: string;
  isGit: boolean;
  isTopLevel: boolean;
  worktrees: WorktreeEntry[];
  branches: GitBranch[];
}

interface Props {
  cwd: string | null | undefined;
  disabled?: boolean;
  /** Switching worktrees always starts a session in the selected checkout. */
  onCwdChange: (cwd: string, projectRoot: string) => void;
}

function WorktreeIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

export function WorktreeSwitcher({ cwd, disabled = false, onCwdChange }: Props) {
  const [state, setState] = useState<WorktreeState | null>(null);
  const [open, setOpen] = useState(false);
  const [newWorktreeOpen, setNewWorktreeOpen] = useState(false);
  const [branch, setBranch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const branchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!cwd) {
      setState(null);
      setOpen(false);
      return;
    }

    let cancelled = false;
    setState(null);
    Promise.all([
      fetch(`/api/worktrees?cwd=${encodeURIComponent(cwd)}`).then((res) => res.json() as Promise<{ projectRoot?: string; isGit?: boolean; isTopLevel?: boolean; worktrees?: WorktreeEntry[]; error?: string }>),
      fetch(`/api/git?cwd=${encodeURIComponent(cwd)}&action=branches`).then((res) => res.ok ? res.json() as Promise<{ branches?: GitBranch[] }> : { branches: [] }),
    ])
      .then(([data, branchData]) => {
        if (cancelled || data.error || !data.projectRoot) return;
        setState({
          projectRoot: data.projectRoot,
          isGit: data.isGit ?? false,
          isTopLevel: data.isTopLevel ?? false,
          worktrees: data.worktrees ?? [],
          branches: branchData.branches ?? [],
        });
      })
      .catch(() => {
        if (!cancelled) setState(null);
      });

    return () => { cancelled = true; };
  }, [cwd, refreshKey]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setNewWorktreeOpen(false);
        setBranch("");
        setError(null);
        setConfirmRemove(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setNewWorktreeOpen(false);
    setBranch("");
    setError(null);
    setConfirmRemove(null);
  }, []);

  const selectWorktree = useCallback((worktree: WorktreeEntry) => {
    if (!state || worktree.path === cwd) {
      closeMenu();
      return;
    }
    closeMenu();
    onCwdChange(worktree.path, state.projectRoot);
  }, [closeMenu, cwd, onCwdChange, state]);

  const selectBranch = useCallback(async (branch: GitBranch) => {
    if (!state || busy) return;
    const existing = state.worktrees.find((worktree) => worktree.branch === branch.name);
    if (existing) {
      selectWorktree(existing);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/worktrees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: state.projectRoot, branch: branch.name }),
      });
      const data = await response.json().catch(() => ({})) as { path?: string; error?: string };
      if (!response.ok || !data.path || data.error) {
        setError(data.error ?? `HTTP ${response.status}`);
        return;
      }
      closeMenu();
      onCwdChange(data.path, state.projectRoot);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [busy, closeMenu, onCwdChange, selectWorktree, state]);

  const createWorktree = useCallback(async () => {
    const trimmedBranch = branch.trim();
    if (!state || !trimmedBranch || busy) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/worktrees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: state.projectRoot, branch: trimmedBranch }),
      });
      const data = await response.json().catch(() => ({})) as { path?: string; error?: string };
      if (!response.ok || !data.path || data.error) {
        setError(data.error ?? `HTTP ${response.status}`);
        return;
      }
      closeMenu();
      onCwdChange(data.path, state.projectRoot);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [branch, busy, closeMenu, onCwdChange, state]);

  const removeWorktree = useCallback(async (path: string, force: boolean) => {
    if (!state || busy) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/worktrees", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: state.projectRoot, path, force }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; dirty?: boolean };
      if (!response.ok) {
        if (data.dirty && !force) {
          setConfirmRemove(path);
          return;
        }
        setError(data.error ?? `HTTP ${response.status}`);
        return;
      }
      setConfirmRemove(null);
      if (path === cwd) {
        closeMenu();
        onCwdChange(state.projectRoot, state.projectRoot);
        return;
      }
      setRefreshKey((key) => key + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [busy, closeMenu, cwd, onCwdChange, state]);

  if (!state?.isGit || !state.isTopLevel) return null;

  const current = state.worktrees.find((worktree) => worktree.path === cwd)
    ?? state.worktrees.find((worktree) => worktree.isMain);
  const currentLabel = current?.branch ?? (current?.isMain ? "main" : "Worktree");
  const unopenedBranches = state.branches.filter((branch) => branch.kind === "local" && !state.worktrees.some((worktree) => worktree.branch === branch.name));

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((value) => !value)}
        disabled={disabled}
        title={current ? `Switch branch: ${current.path}` : "Switch branch"}
        aria-label="Switch branch"
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 5,
          height: 32,
          maxWidth: 178,
          padding: "0 8px",
          background: open ? "var(--bg-hover)" : "none",
          border: "none",
          borderRadius: 9,
          color: current && !current.isMain ? "var(--accent)" : "var(--text-muted)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          fontSize: 12,
          transition: "background 0.12s, color 0.12s",
        }}
        onMouseEnter={(event) => {
          if (!disabled) {
            event.currentTarget.style.background = "var(--bg-hover)";
            event.currentTarget.style.color = "var(--text)";
          }
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = open ? "var(--bg-hover)" : "none";
          event.currentTarget.style.color = current && !current.isMain ? "var(--accent)" : "var(--text-muted)";
        }}
      >
        <WorktreeIcon />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentLabel}</span>
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
          <polyline points="2 3.5 5 6.5 8 3.5" />
        </svg>
      </button>

      {open && (
        <div className="overlay-surface" style={{
          position: "absolute",
          right: 0,
          bottom: "calc(100% + 6px)",
          zIndex: 110,
          width: "min(320px, calc(100vw - 24px))",
          maxHeight: "min(430px, 70vh)",
          overflow: "hidden",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          boxShadow: "0 -6px 20px rgba(0,0,0,0.12)",
        }}>
          <div style={{ maxHeight: "min(304px, 48vh)", overflowY: "auto" }}>
            {state.worktrees.map((worktree) => {
              const isCurrent = worktree.path === cwd;
              if (confirmRemove === worktree.path) {
                return (
                  <div key={worktree.path} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderBottom: "1px solid var(--border)", background: "rgba(239,68,68,0.06)" }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: "var(--text)" }}>Uncommitted changes. Force remove?</span>
                    <button type="button" onClick={() => void removeWorktree(worktree.path, true)} disabled={busy} style={{ padding: "3px 8px", border: "none", borderRadius: 5, background: "#ef4444", color: "#fff", cursor: "pointer", fontSize: 11 }}>Force</button>
                    <button type="button" onClick={() => setConfirmRemove(null)} style={{ padding: "3px 8px", border: "1px solid var(--border)", borderRadius: 5, background: "var(--bg-hover)", color: "var(--text-muted)", cursor: "pointer", fontSize: 11 }}>Cancel</button>
                  </div>
                );
              }

              return (
                <div key={worktree.path} style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--border)" }}>
                  <button
                    type="button"
                    onClick={() => selectWorktree(worktree)}
                    title={worktree.path}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flex: 1,
                      minWidth: 0,
                      padding: "9px 10px",
                      border: "none",
                      background: isCurrent ? "var(--bg-selected)" : "var(--bg)",
                      color: isCurrent ? "var(--text)" : "var(--text-muted)",
                      cursor: "pointer",
                      fontSize: 12,
                      textAlign: "left",
                    }}
                  >
                    {isCurrent ? (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="1.5 5 4 7.5 8.5 2.5" /></svg>
                    ) : <span style={{ width: 10, flexShrink: 0 }} />}
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--font-mono)" }}>{worktree.branch ?? worktree.path}</span>
                    {worktree.isMain && <span style={{ color: "var(--text-dim)", fontSize: 10 }}>main</span>}
                  </button>
                  {!worktree.isMain && (
                    <button
                      type="button"
                      onClick={() => void removeWorktree(worktree.path, false)}
                      disabled={busy}
                      title={`Remove worktree checkout ${worktree.path}; the branch is kept`}
                      aria-label={`Remove worktree ${worktree.branch ?? worktree.path}`}
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 34px", width: 34, height: 30, marginRight: 4, padding: 0, border: "none", borderRadius: 5, background: "none", color: "var(--text-dim)", cursor: busy ? "not-allowed" : "pointer" }}
                      onMouseEnter={(event) => { if (!busy) { event.currentTarget.style.background = "rgba(239,68,68,0.08)"; event.currentTarget.style.color = "#ef4444"; } }}
                      onMouseLeave={(event) => { event.currentTarget.style.background = "none"; event.currentTarget.style.color = "var(--text-dim)"; }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                    </button>
                  )}
                </div>
              );
            })}
            {unopenedBranches.length > 0 && <>
              <div style={{ padding: "7px 10px 4px", borderBottom: "1px solid var(--border)", color: "var(--text-dim)", fontSize: 10, fontWeight: 650, textTransform: "uppercase" }}>Branches</div>
              {unopenedBranches.map((branch) => (
                <button key={branch.name} type="button" onClick={() => void selectBranch(branch)} disabled={busy} title={`Open ${branch.name} in a worktree`} style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, padding: "8px 10px", border: "none", borderBottom: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-muted)", cursor: busy ? "not-allowed" : "pointer", fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "left" }}>
                  <span style={{ width: 10, flexShrink: 0 }} />
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{branch.name}</span>
                </button>
              ))}
            </>}
          </div>

          {!newWorktreeOpen ? (
            <button
              type="button"
              onClick={() => {
                setNewWorktreeOpen(true);
                setError(null);
                window.setTimeout(() => branchInputRef.current?.focus(), 0);
              }}
              style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "9px 10px", border: "none", background: "var(--bg)", color: "var(--text-muted)", cursor: "pointer", fontSize: 12, textAlign: "left" }}
            >
              <svg width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true"><line x1="5" y1="1" x2="5" y2="9" /><line x1="1" y1="5" x2="9" y2="5" /></svg>
              New branch
            </button>
          ) : (
            <div style={{ padding: "8px 10px", borderTop: "1px solid var(--border)" }}>
              <input
                ref={branchInputRef}
                value={branch}
                onChange={(event) => { setBranch(event.target.value); setError(null); }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") { event.preventDefault(); void createWorktree(); }
                  if (event.key === "Escape") { setNewWorktreeOpen(false); setBranch(""); setError(null); }
                }}
                placeholder="branch name"
                style={{ width: "100%", boxSizing: "border-box", padding: "6px 8px", border: "1px solid var(--accent)", borderRadius: 5, background: "var(--bg)", color: "var(--text)", outline: "none", fontFamily: "var(--font-mono)", fontSize: 12 }}
              />
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button type="button" onClick={() => void createWorktree()} disabled={busy || !branch.trim()} style={{ flex: 1, padding: "5px 0", border: "none", borderRadius: 5, background: "var(--accent)", color: "#fff", cursor: busy || !branch.trim() ? "not-allowed" : "pointer", opacity: busy || !branch.trim() ? 0.65 : 1, fontSize: 11, fontWeight: 600 }}>{busy ? "Creating..." : "Create"}</button>
                <button type="button" onClick={() => { setNewWorktreeOpen(false); setBranch(""); setError(null); }} style={{ flex: 1, padding: "5px 0", border: "1px solid var(--border)", borderRadius: 5, background: "var(--bg-hover)", color: "var(--text-muted)", cursor: "pointer", fontSize: 11 }}>Cancel</button>
              </div>
            </div>
          )}
          {error && <div style={{ padding: "0 10px 9px", color: "#dc2626", fontSize: 11, lineHeight: 1.35, overflowWrap: "anywhere" }}>{error}</div>}
        </div>
      )}
    </div>
  );
}
