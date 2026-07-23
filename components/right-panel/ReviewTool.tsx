"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InlineDiff, SplitDiff } from "../InlineDiff";
import { getFileIcon } from "../FileIcons";
import { getRelativeFilePath, joinFilePath } from "@/lib/file-paths";
import { sumChanges, type ChangedFile, type DiffSection } from "@/lib/git-diff-parse";
import { buildCommitGraph, type GraphRow } from "@/lib/git-graph";
import type { RightPanelToolDefinition, RightPanelToolProps } from "./types";

function ReviewIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="5" r="2" /><circle cx="18" cy="7" r="2" /><circle cx="6" cy="19" r="2" />
      <path d="M8 5h3a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H8m8-10h-2" />
    </svg>
  );
}

type ListResponse = {
  staged?: ChangedFile[];
  unstaged?: ChangedFile[];
  notGit?: boolean;
  branch?: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
  error?: string;
};
type FileResponse = { oldContent?: string; newContent?: string; error?: string };
type GitCommit = { sha: string; shortSha: string; author: string; date: string; subject: string; refs: string[]; parents: string[] };
type HistoryResponse = { commits?: GitCommit[]; hasMore?: boolean; notGit?: boolean; error?: string };
type CommitResponse = { commit?: GitCommit; files?: ChangedFile[]; error?: string };
type Repository = { cwd: string; label: string };
type Selection = { file: ChangedFile; section: DiffSection };
type DiffMode = "inline" | "split";
type GitAction = "stage" | "stage-all" | "unstage" | "unstage-all" | "discard" | "discard-all" | "commit" | "fetch" | "pull" | "push" | "set-remote";

const STATUS_LABEL: Record<string, string> = { M: "modified", A: "added", D: "deleted", R: "renamed", U: "untracked" };
const GRAPH_COLORS = ["#4493f8", "#41b883", "#e5a14b", "#e06c75", "#c678dd"];

function CommitGraph({ row }: { row: GraphRow }) {
  const laneWidth = 13;
  const x = (lane: number) => lane * laneWidth + laneWidth / 2;
  const color = (sha: string) => GRAPH_COLORS[parseInt(sha.slice(0, 2), 16) % GRAPH_COLORS.length];
  const width = row.lanes * laneWidth;
  return <svg className="git-review-commit-graph" width={width} height="34" viewBox={`0 0 ${width} 34`} aria-hidden="true">
    {row.continuations.map(({ from, to, sha }) => <path key={`${sha}:${from}:${to}`} d={from === to ? `M${x(from)} 0V34` : `M${x(from)} 0L${x(to)} 34`} stroke={color(sha)} />)}
    {!row.startsHere && <path d={`M${x(row.lane)} 0V17`} stroke={color(row.sha)} />}
    {row.parents.map(({ to, sha }) => <path key={sha} d={`M${x(row.lane)} 17L${x(to)} 34`} stroke={color(sha)} />)}
    <circle cx={x(row.lane)} cy="17" r="4" fill={color(row.sha)} />
  </svg>;
}

function ActionButton({ label, title, onClick, disabled = false, danger = false }: { label: string; title: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return <button type="button" className={`git-review-icon-action${danger ? " is-danger" : ""}`} onClick={onClick} disabled={disabled} title={title} aria-label={title}>{label}</button>;
}

function DiffModeButtons({ mode, onChange }: { mode: DiffMode; onChange: (mode: DiffMode) => void }) {
  return <span className="git-review-diff-mode" role="group" aria-label="Diff format">
    <button type="button" className={`git-review-icon-action${mode === "inline" ? " is-active" : ""}`} onClick={() => onChange("inline")} title="Unified diff" aria-label="Unified diff" aria-pressed={mode === "inline"}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M5 3h8M5 8h8M5 13h8M2 3h.01M2 8h.01M2 13h.01" /></svg>
    </button>
    <button type="button" className={`git-review-icon-action${mode === "split" ? " is-active" : ""}`} onClick={() => onChange("split")} title="A/B diff" aria-label="A/B diff" aria-pressed={mode === "split"}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="1.5" y="2" width="13" height="12" rx="1" /><path d="M8 2v12M3.5 5h2M10.5 5h2M3.5 8h2M10.5 8h2" /></svg>
    </button>
  </span>;
}

function ChangeSection({
  title,
  section,
  files,
  selectedPath,
  onSelect,
  onAction,
  busy,
}: {
  title: string;
  section?: DiffSection;
  files: ChangedFile[];
  selectedPath?: string;
  onSelect: (file: ChangedFile) => void;
  onAction?: (action: GitAction, file?: ChangedFile) => void;
  busy: boolean;
}) {
  const totals = sumChanges(files);
  const staged = section === "staged";
  const canAct = section === "staged" || section === "unstaged";
  return (
    <section className="git-review-section">
      <div className="git-review-section-header">
        <span>{title}</span>
        <span>{files.length}</span>
        {(totals.added > 0 || totals.deleted > 0) && <span className="git-review-section-stat"><b>+{totals.added}</b><i>-{totals.deleted}</i></span>}
        {canAct && <ActionButton label={staged ? "−" : "+"} title={staged ? "Unstage all files" : "Stage all files"} onClick={() => onAction?.(staged ? "unstage-all" : "stage-all")} disabled={busy} />}
        {canAct && !staged && <ActionButton label="↶" title="Discard all unstaged changes" onClick={() => onAction?.("discard-all")} disabled={busy} danger />}
      </div>
      {files.map((file) => {
        const selected = selectedPath === file.path;
        const name = file.path.split("/").pop() ?? file.path;
        const directory = file.path.slice(0, -(name.length + (file.path === name ? 0 : 1)));
        return (
          <div key={`${section}:${file.path}`} className={`git-review-file${selected ? " is-selected" : ""}`}>
            <button type="button" className="git-review-file-main" onClick={() => onSelect(file)} title={file.path}>
              <span className={`git-review-status status-${file.status}`} title={STATUS_LABEL[file.status] ?? file.status}>{file.status}</span>
              <span className="git-review-file-icon">{getFileIcon(name, 14)}</span>
              <span className="git-review-file-label"><strong>{name}</strong>{directory && <small>{directory}</small>}</span>
              {(file.added > 0 || file.deleted > 0) && <span className="git-review-file-stat">{file.added > 0 && <b>+{file.added}</b>}{file.deleted > 0 && <i>-{file.deleted}</i>}</span>}
            </button>
            {canAct && <span className="git-review-file-actions">
              <ActionButton label={staged ? "−" : "+"} title={staged ? `Unstage ${file.path}` : `Stage ${file.path}`} onClick={() => onAction?.(staged ? "unstage" : "stage", file)} disabled={busy} />
              {!staged && <ActionButton label="↶" title={`Discard changes to ${file.path}`} onClick={() => onAction?.("discard", file)} disabled={busy} danger />}
            </span>}
          </div>
        );
      })}
    </section>
  );
}

function ReviewTool({ cwd, onAtMention, onOpenFile, onRevealInFileTree }: RightPanelToolProps) {
  const [mode, setMode] = useState<"changes" | "branch" | "history">("changes");
  const [repoCwd, setRepoCwd] = useState(cwd);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [remoteSetupOpen, setRemoteSetupOpen] = useState(false);
  const [remoteInput, setRemoteInput] = useState("");
  const [staged, setStaged] = useState<ChangedFile[]>([]);
  const [unstaged, setUnstaged] = useState<ChangedFile[]>([]);
  const [branchChanges, setBranchChanges] = useState<ChangedFile[]>([]);
  const [diffMode, setDiffMode] = useState<DiffMode>("inline");
  const [branchDiffState, setBranchDiffState] = useState({ loading: false, error: "", baseRef: "" });
  const [selection, setSelection] = useState<Selection | null>(null);
  const [diff, setDiff] = useState({ loading: false, oldContent: "", newContent: "", error: "" });
  const [status, setStatus] = useState({ loading: true, notGit: false, error: "", branch: "", upstream: "", ahead: 0, behind: 0 });
  const [history, setHistory] = useState({ loading: false, loadingMore: false, error: "", commits: [] as GitCommit[], hasMore: false });
  const [selectedCommit, setSelectedCommit] = useState<GitCommit | null>(null);
  const [commitDetails, setCommitDetails] = useState({ loading: false, files: [] as ChangedFile[], error: "" });
  const [commitFile, setCommitFile] = useState<ChangedFile | null>(null);
  const [commitFileDiff, setCommitFileDiff] = useState({ loading: false, oldContent: "", newContent: "", error: "" });
  const [operation, setOperation] = useState<GitAction | "">("");
  const [operationError, setOperationError] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [discardConfirm, setDiscardConfirm] = useState<{ action: "discard" | "discard-all"; file?: ChangedFile } | null>(null);
  const listRequestRef = useRef(0);
  const fileRequestRef = useRef(0);
  const branchRequestRef = useRef(0);
  const historyRequestRef = useRef(0);
  const commitRequestRef = useRef(0);
  const commitFileRequestRef = useRef(0);
  const historyRef = useRef(history);

  useEffect(() => { historyRef.current = history; }, [history]);

  useEffect(() => {
    let disposed = false;
    setRepoCwd(cwd);
    setRepositories([]);
    setRemoteUrl("");
    setRemoteSetupOpen(false);
    void fetch(`/api/git?cwd=${encodeURIComponent(cwd)}&action=repositories`)
      .then(async (response) => ({ response, body: await response.json() as { repositories?: Repository[] } }))
      .then(({ response, body }) => {
        if (disposed || !response.ok) return;
        const next = body.repositories ?? [];
        setRepositories(next);
        setRepoCwd((current) => next.some((repo) => repo.cwd === current) ? current : next[0]?.cwd ?? cwd);
      })
      .catch(() => undefined);
    return () => { disposed = true; };
  }, [cwd]);

  const loadChanges = useCallback(async () => {
    const requestId = ++listRequestRef.current;
    setStatus((current) => ({ ...current, loading: true, error: "" }));
    try {
      const [response, remoteResponse] = await Promise.all([
        fetch(`/api/git-diff?cwd=${encodeURIComponent(repoCwd)}`),
        fetch(`/api/git?cwd=${encodeURIComponent(repoCwd)}&action=remote`),
      ]);
      const body = await response.json() as ListResponse;
      if (!response.ok) throw new Error(body.error || `Unable to load changes (HTTP ${response.status})`);
      if (requestId !== listRequestRef.current) return;
      if (body.notGit) {
        setStaged([]);
        setUnstaged([]);
        setSelection(null);
        setStatus({ loading: false, notGit: true, error: "", branch: "", upstream: "", ahead: 0, behind: 0 });
        setRemoteUrl("");
        return;
      }
      const remoteBody = remoteResponse.ok ? await remoteResponse.json() as { url?: string } : {};
      setStaged(body.staged ?? []);
      setUnstaged(body.unstaged ?? []);
      setRemoteUrl(remoteBody.url ?? "");
      setStatus({ loading: false, notGit: false, error: body.error ?? "", branch: body.branch ?? "HEAD", upstream: body.upstream ?? "", ahead: body.ahead ?? 0, behind: body.behind ?? 0 });
    } catch (error) {
      if (requestId !== listRequestRef.current) return;
      setStatus((current) => ({ ...current, loading: false, notGit: false, error: error instanceof Error ? error.message : String(error) }));
    }
  }, [repoCwd]);

  useEffect(() => {
    setSelection(null);
    setDiff({ loading: false, oldContent: "", newContent: "", error: "" });
    setOperationError("");
    void loadChanges();
    const interval = window.setInterval(loadChanges, 5000);
    return () => window.clearInterval(interval);
  }, [repoCwd, loadChanges]);

  const loadBranchChanges = useCallback(async () => {
    const requestId = ++branchRequestRef.current;
    setBranchDiffState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch(`/api/git-diff?cwd=${encodeURIComponent(repoCwd)}&compare=upstream`);
      const body = await response.json() as { branchChanges?: ChangedFile[]; baseRef?: string; error?: string };
      if (!response.ok) throw new Error(body.error || `Unable to compare this branch (HTTP ${response.status})`);
      if (requestId !== branchRequestRef.current) return;
      setBranchChanges(body.branchChanges ?? []);
      setBranchDiffState({ loading: false, error: "", baseRef: body.baseRef ?? "" });
    } catch (error) {
      if (requestId !== branchRequestRef.current) return;
      setBranchChanges([]);
      setBranchDiffState({ loading: false, error: error instanceof Error ? error.message : String(error), baseRef: "" });
    }
  }, [repoCwd]);

  useEffect(() => {
    if (mode !== "branch") return;
    setSelection(null);
    setDiff({ loading: false, oldContent: "", newContent: "", error: "" });
    void loadBranchChanges();
  }, [loadBranchChanges, mode, repoCwd]);

  const loadHistory = useCallback(async (append = false) => {
    const requestId = ++historyRequestRef.current;
    const offset = append ? historyRef.current.commits.length : 0;
    setHistory((current) => ({ ...current, loading: !append, loadingMore: append, error: append ? current.error : "" }));
    try {
      const response = await fetch(`/api/git-history?cwd=${encodeURIComponent(repoCwd)}&offset=${offset}`);
      const body = await response.json() as HistoryResponse;
      if (!response.ok || body.error) throw new Error(body.error || `Unable to load history (HTTP ${response.status})`);
      if (requestId !== historyRequestRef.current) return;
      const commits = body.commits ?? [];
      setHistory((current) => ({ loading: false, loadingMore: false, error: "", commits: append ? [...current.commits, ...commits] : commits, hasMore: body.hasMore ?? false }));
    } catch (error) {
      if (requestId !== historyRequestRef.current) return;
      setHistory((current) => ({ ...current, loading: false, loadingMore: false, error: error instanceof Error ? error.message : String(error) }));
    }
  }, [repoCwd]);

  useEffect(() => {
    if (mode !== "history") return;
    setSelectedCommit(null);
    setCommitDetails({ loading: false, files: [], error: "" });
    setCommitFile(null);
    setCommitFileDiff({ loading: false, oldContent: "", newContent: "", error: "" });
    void loadHistory();
  }, [loadHistory, mode, repoCwd]);

  const selectFile = useCallback(async (file: ChangedFile, section: DiffSection) => {
    const requestId = ++fileRequestRef.current;
    setSelection({ file, section });
    setDiff({ loading: true, oldContent: "", newContent: "", error: "" });
    try {
      const source = file.sourcePath ? `&source=${encodeURIComponent(file.sourcePath)}` : "";
      const response = await fetch(`/api/git-diff?cwd=${encodeURIComponent(repoCwd)}&file=${encodeURIComponent(file.path)}&section=${section}${source}`);
      const body = await response.json() as FileResponse;
      if (!response.ok || body.error || body.oldContent === undefined || body.newContent === undefined) throw new Error(body.error || `Unable to load diff (HTTP ${response.status})`);
      if (requestId !== fileRequestRef.current) return;
      setDiff({ loading: false, oldContent: body.oldContent, newContent: body.newContent, error: "" });
    } catch (error) {
      if (requestId !== fileRequestRef.current) return;
      setDiff({ loading: false, oldContent: "", newContent: "", error: error instanceof Error ? error.message : String(error) });
    }
  }, [repoCwd]);

  const selectCommit = useCallback(async (commit: GitCommit) => {
    const requestId = ++commitRequestRef.current;
    setSelectedCommit(commit);
    setCommitDetails({ loading: true, files: [], error: "" });
    setCommitFile(null);
    setCommitFileDiff({ loading: false, oldContent: "", newContent: "", error: "" });
    try {
      const response = await fetch(`/api/git-history?cwd=${encodeURIComponent(repoCwd)}&commit=${encodeURIComponent(commit.sha)}`);
      const body = await response.json() as CommitResponse;
      if (!response.ok || body.error || body.files === undefined) throw new Error(body.error || `Unable to load commit (HTTP ${response.status})`);
      if (requestId !== commitRequestRef.current) return;
      setCommitDetails({ loading: false, files: body.files, error: "" });
    } catch (error) {
      if (requestId !== commitRequestRef.current) return;
      setCommitDetails({ loading: false, files: [], error: error instanceof Error ? error.message : String(error) });
    }
  }, [repoCwd]);

  const selectCommitFile = useCallback(async (file: ChangedFile) => {
    if (!selectedCommit) return;
    const requestId = ++commitFileRequestRef.current;
    setCommitFile(file);
    setCommitFileDiff({ loading: true, oldContent: "", newContent: "", error: "" });
    try {
      const source = file.sourcePath ? `&source=${encodeURIComponent(file.sourcePath)}` : "";
      const response = await fetch(`/api/git-history?cwd=${encodeURIComponent(repoCwd)}&commit=${encodeURIComponent(selectedCommit.sha)}&file=${encodeURIComponent(file.path)}${source}`);
      const body = await response.json() as FileResponse;
      if (!response.ok || body.error || body.oldContent === undefined || body.newContent === undefined) throw new Error(body.error || `Unable to load diff (HTTP ${response.status})`);
      if (requestId !== commitFileRequestRef.current) return;
      setCommitFileDiff({ loading: false, oldContent: body.oldContent, newContent: body.newContent, error: "" });
    } catch (error) {
      if (requestId !== commitFileRequestRef.current) return;
      setCommitFileDiff({ loading: false, oldContent: "", newContent: "", error: error instanceof Error ? error.message : String(error) });
    }
  }, [repoCwd, selectedCommit]);

  const runAction = useCallback(async (action: GitAction, file?: ChangedFile, options?: { remoteUrl?: string; confirmed?: boolean }) => {
    if (operation) return;
    const destructive = action === "discard" || action === "discard-all";
    if (destructive && !options?.confirmed) {
      setDiscardConfirm({ action, ...(file ? { file } : {}) });
      return;
    }
    if (action === "commit" && !commitMessage.trim()) {
      setOperationError("Enter a commit message.");
      return;
    }
    setOperation(action);
    setOperationError("");
    try {
      const response = await fetch("/api/git", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          cwd: repoCwd,
          ...(file ? { path: file.path, untracked: file.status === "U" } : {}),
          ...(action === "commit" ? { message: commitMessage } : {}),
          ...(action === "set-remote" ? { remoteUrl: options?.remoteUrl } : {}),
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || `Git operation failed (HTTP ${response.status})`);
      setSelection(null);
      setDiff({ loading: false, oldContent: "", newContent: "", error: "" });
      if (action === "commit") {
        setCommitMessage("");
        await loadHistory();
      }
      if (action === "set-remote") {
        setRemoteSetupOpen(false);
        setRemoteInput("");
      }
      await loadChanges();
      if (mode === "branch") await loadBranchChanges();
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error));
    } finally {
      setOperation("");
    }
  }, [commitMessage, loadBranchChanges, loadChanges, loadHistory, mode, operation, repoCwd]);

  const total = staged.length + unstaged.length;
  const modified = unstaged.filter((file) => file.status !== "U").length;
  const untracked = unstaged.length - modified;
  const busy = Boolean(operation);
  const commitGraph = useMemo(() => buildCommitGraph(history.commits), [history.commits]);
  return (
    <section className="git-review">
      <header className="git-review-toolbar">
        <div className="git-review-toolbar-title">
          <strong>Git Review</strong><span title={repoCwd}>{repoCwd}</span>
          <div className="git-review-selectors">
            {repositories.length > 1 && <select value={repoCwd} disabled={busy} onChange={(event) => setRepoCwd(event.currentTarget.value)} aria-label="Repository" title="Repository">
              {repositories.map((repository) => <option key={repository.cwd} value={repository.cwd}>{repository.label}</option>)}
            </select>}
          </div>
        </div>
        {!status.notGit && <div className="git-review-status-summary" aria-label="Git status">
          <span title="Current branch">{status.branch || "HEAD"}</span>
          <span title="Commits ahead">↑ {status.ahead}</span>
          <span title="Commits behind">↓ {status.behind}</span>
          <span title="Staged files">Staged {staged.length}</span>
          <span title="Unstaged files">Unstaged {modified}</span>
          <span title="Untracked files">Untracked {untracked}</span>
        </div>}
        <div className="git-review-modes" role="tablist" aria-label="Review mode">
          <button type="button" role="tab" aria-selected={mode === "changes"} className={mode === "changes" ? "is-active" : ""} onClick={() => setMode("changes")}>Changes</button>
          <button type="button" role="tab" aria-selected={mode === "branch"} className={mode === "branch" ? "is-active" : ""} onClick={() => setMode("branch")} disabled={!status.upstream}>Branch</button>
          <button type="button" role="tab" aria-selected={mode === "history"} className={mode === "history" ? "is-active" : ""} onClick={() => setMode("history")}>History</button>
        </div>
        <div className="git-review-remote-actions">
          <ActionButton label="↓" title={remoteUrl ? "Fetch" : "Configure remote first"} onClick={() => void runAction("fetch")} disabled={busy || !remoteUrl} />
          <ActionButton label="⇣" title={remoteUrl ? "Pull fast-forward changes" : "Configure remote first"} onClick={() => void runAction("pull")} disabled={busy || !remoteUrl} />
          <ActionButton label="⇡" title={remoteUrl ? "Push" : "Configure remote first"} onClick={() => void runAction("push")} disabled={busy || !remoteUrl} />
          <ActionButton label="⌁" title={remoteUrl ? "Change origin remote" : "Configure origin remote"} onClick={() => { setRemoteInput(remoteUrl); setRemoteSetupOpen((open) => !open); }} disabled={busy || status.notGit} />
        </div>
        <ActionButton label="↻" title="Refresh" onClick={() => mode === "changes" ? void loadChanges() : mode === "branch" ? void loadBranchChanges() : void loadHistory()} disabled={busy || (mode === "changes" ? status.loading : mode === "branch" ? branchDiffState.loading : history.loading || history.loadingMore)} />
      </header>

      {remoteSetupOpen && <form className="git-review-inline-form" onSubmit={(event) => { event.preventDefault(); void runAction("set-remote", undefined, { remoteUrl: remoteInput }); }}>
        <input autoFocus value={remoteInput} onChange={(event) => setRemoteInput(event.currentTarget.value)} placeholder="Origin remote URL" aria-label="Origin remote URL" disabled={busy} />
        <ActionButton label="✓" title="Save origin remote" onClick={() => void runAction("set-remote", undefined, { remoteUrl: remoteInput })} disabled={busy || !remoteInput.trim()} />
        <ActionButton label="×" title="Cancel" onClick={() => setRemoteSetupOpen(false)} disabled={busy} />
      </form>}
      {discardConfirm && <div className="git-review-confirm" role="alertdialog" aria-modal="true" aria-label="Confirm discard">
        <strong>{discardConfirm.action === "discard-all" ? "Discard all unstaged changes?" : `Discard changes to ${discardConfirm.file?.path}?`}</strong>
        <span>This cannot be undone.</span>
        <div><button type="button" disabled={busy} onClick={() => { const target = discardConfirm; setDiscardConfirm(null); void runAction(target.action, target.file, { confirmed: true }); }}>{busy ? "Discarding..." : "Discard"}</button><button type="button" disabled={busy} onClick={() => setDiscardConfirm(null)}>Cancel</button></div>
      </div>}
      {operationError && <div className="git-review-error git-review-operation-error">{operationError}</div>}
      {status.notGit ? <div className="git-review-empty">This workspace is not a Git repository.</div> : mode !== "history" ? <div className="git-review-layout">
        <aside className="git-review-files" aria-label="Changed files">
          {mode === "changes" && <>
            {status.error && <div className="git-review-error">{status.error}</div>}
            {status.loading && total === 0 && <div className="git-review-empty">Loading changes...</div>}
            {!status.loading && !status.error && total === 0 && <div className="git-review-empty">Working tree is clean.</div>}
            {staged.length > 0 && <>
            <form className="git-review-commit-form" onSubmit={(event) => { event.preventDefault(); void runAction("commit"); }}>
              <input value={commitMessage} onChange={(event) => setCommitMessage(event.currentTarget.value)} placeholder="Commit message" aria-label="Commit message" disabled={busy} />
              <ActionButton label="✓" title="Commit staged changes" onClick={() => void runAction("commit")} disabled={busy || !commitMessage.trim()} />
            </form>
            <ChangeSection title="Staged" section="staged" files={staged} selectedPath={selection?.section === "staged" ? selection.file.path : undefined} onSelect={(file) => void selectFile(file, "staged")} onAction={(action, file) => void runAction(action, file)} busy={busy} />
            </>}
            {unstaged.length > 0 && <ChangeSection title="Changes" section="unstaged" files={unstaged} selectedPath={selection?.section === "unstaged" ? selection.file.path : undefined} onSelect={(file) => void selectFile(file, "unstaged")} onAction={(action, file) => void runAction(action, file)} busy={busy} />}
          </>}
          {mode === "branch" && <>
            {branchDiffState.error && <div className="git-review-error">{branchDiffState.error}</div>}
            {branchDiffState.loading && branchChanges.length === 0 && <div className="git-review-empty">Loading branch comparison...</div>}
            {!branchDiffState.loading && !branchDiffState.error && branchChanges.length === 0 && <div className="git-review-empty">No commits ahead of {branchDiffState.baseRef || status.upstream}.</div>}
            {branchChanges.length > 0 && <ChangeSection title={`Compared with ${branchDiffState.baseRef || status.upstream}`} section="branch" files={branchChanges} selectedPath={selection?.section === "branch" ? selection.file.path : undefined} onSelect={(file) => void selectFile(file, "branch")} busy={busy} />}
          </>}
        </aside>
        <main className="git-review-diff">
          {!selection && <div className="git-review-empty">Select a changed file to inspect its diff.</div>}
          {selection && <>
            <header className="git-review-diff-header"><div><strong>{selection.file.path.split("/").pop()}</strong><span>{selection.file.path}</span></div><span className="git-review-diff-actions"><DiffModeButtons mode={diffMode} onChange={setDiffMode} /><ActionButton label="@" title="Insert file into chat" onClick={() => onAtMention(getRelativeFilePath(joinFilePath(repoCwd, selection.file.path), cwd), false)} /><ActionButton label="⊡" title="Reveal in file tree" onClick={() => onRevealInFileTree(joinFilePath(repoCwd, selection.file.path))} /><ActionButton label="↗" title="Open file" onClick={() => onOpenFile(joinFilePath(repoCwd, selection.file.path), selection.file.path.split("/").pop() ?? selection.file.path)} /></span></header>
            {diff.loading && <div className="git-review-empty">Loading diff...</div>}
            {diff.error && <div className="git-review-error">{diff.error}</div>}
            {!diff.loading && !diff.error && (diffMode === "inline" ? <InlineDiff oldContent={diff.oldContent} newContent={diff.newContent} /> : <SplitDiff oldContent={diff.oldContent} newContent={diff.newContent} />)}
          </>}
        </main>
      </div> : <div className="git-review-layout">
        <aside className="git-review-files git-review-history-list" aria-label="Commit history">
          {history.error && <div className="git-review-error">{history.error}</div>}
          {history.loading && history.commits.length === 0 && <div className="git-review-empty">Loading history...</div>}
          {!history.loading && !history.error && history.commits.length === 0 && <div className="git-review-empty">No commits yet.</div>}
          {history.commits.map((commit, index) => <button key={commit.sha} type="button" className={`git-review-commit${selectedCommit?.sha === commit.sha ? " is-selected" : ""}`} onClick={() => void selectCommit(commit)} title={commit.subject || "(no subject)"}><CommitGraph row={commitGraph[index]} /><strong>{commit.subject || "(no subject)"}</strong></button>)}
          {history.hasMore && <button type="button" className="git-review-load-more" disabled={history.loadingMore} onClick={() => void loadHistory(true)}>{history.loadingMore ? "Loading..." : "Load more"}</button>}
        </aside>
        <main className="git-review-diff git-review-history-details">
          {!selectedCommit && <div className="git-review-empty">Select a commit to inspect its changes.</div>}
          {selectedCommit && <>
            <header className="git-review-diff-header"><div><strong>{selectedCommit.subject || "(no subject)"}</strong><span>{[selectedCommit.shortSha, selectedCommit.author, selectedCommit.date].filter(Boolean).join(" · ")}</span>{selectedCommit.refs.length > 0 && <span className="git-review-commit-refs">{selectedCommit.refs.join(" · ")}</span>}</div><DiffModeButtons mode={diffMode} onChange={setDiffMode} /></header>
            <section className="git-review-history-files" aria-label="Files in commit">
              {commitDetails.loading && <div className="git-review-empty">Loading files...</div>}
              {commitDetails.error && <div className="git-review-error">{commitDetails.error}</div>}
              {!commitDetails.loading && !commitDetails.error && commitDetails.files.length === 0 && <div className="git-review-empty">This commit has no file changes.</div>}
              {!commitDetails.loading && !commitDetails.error && commitDetails.files.length > 0 && <ChangeSection title="Files" files={commitDetails.files} selectedPath={commitFile?.path} onSelect={(file) => void selectCommitFile(file)} busy={false} />}
            </section>
            <section className="git-review-history-file-diff">
              {!commitFile && !commitDetails.loading && !commitDetails.error && commitDetails.files.length > 0 && <div className="git-review-empty">Select a file to inspect its diff.</div>}
              {commitFile && <>
                <header className="git-review-history-file-header"><strong>{commitFile.path.split("/").pop()}</strong><span>{commitFile.path}</span></header>
                {commitFileDiff.loading && <div className="git-review-empty">Loading diff...</div>}
                {commitFileDiff.error && <div className="git-review-error">{commitFileDiff.error}</div>}
                {!commitFileDiff.loading && !commitFileDiff.error && (diffMode === "inline" ? <InlineDiff oldContent={commitFileDiff.oldContent} newContent={commitFileDiff.newContent} /> : <SplitDiff oldContent={commitFileDiff.oldContent} newContent={commitFileDiff.newContent} />)}
              </>}
            </section>
          </>}
        </main>
      </div>}
    </section>
  );
}

export const reviewTool: RightPanelToolDefinition = {
  id: "review",
  label: "审查",
  description: "查看和管理代码变更",
  Icon: ReviewIcon,
  Component: ReviewTool,
};
