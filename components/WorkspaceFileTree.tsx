"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AtSign, Check, ChevronRight, ChevronUp, Eye, EyeOff, LoaderCircle, Plus, RefreshCw, Search, X } from "lucide-react";
import { FolderIcon, getFileIcon } from "./FileIcons";
import { encodeFilePathForApi, getRelativeFilePath, joinFilePath } from "@/lib/file-paths";
import { useIsMobile } from "@/hooks/useIsMobile";

type FileEntry = { name: string; isDir: boolean };
type SearchEntry = { path: string; isDir: boolean };
type TreeNode = {
  path: string;
  name: string;
  isDir: boolean;
  children: string[];
  loaded: boolean;
  loading: boolean;
  error?: string;
};
type TreeNodes = Record<string, TreeNode>;
type MutationAction = "create-file" | "create-folder" | "rename";

interface Props {
  cwd: string;
  onOpenFile: (filePath: string, fileName: string) => void;
  refreshKey?: number;
  revealRequest?: { path: string; id: number } | null;
  onAtMention?: (relativePath: string, isDir: boolean) => void;
  showToolbar?: boolean;
  allowMutations?: boolean;
}

function rootNode(cwd: string): TreeNode {
  return { path: "", name: cwd.split("/").filter(Boolean).pop() || cwd, isDir: true, children: [], loaded: false, loading: false };
}

function sortEntries(entries: FileEntry[]) {
  return [...entries].sort((left, right) => Number(right.isDir) - Number(left.isDir) || left.name.localeCompare(right.name));
}

function responseError(status: number, body: unknown) {
  return typeof body === "object" && body && "error" in body && typeof body.error === "string"
    ? body.error
    : `Unable to load files (HTTP ${status})`;
}

function parentPath(path: string) {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
}

function isHiddenPath(path: string) {
  return path.split("/").some((segment) => segment.startsWith("."));
}

export function WorkspaceFileTree({ cwd, onOpenFile, refreshKey, revealRequest, onAtMention, showToolbar = true, allowMutations = false }: Props) {
  const isMobile = useIsMobile();
  const [nodes, setNodes] = useState<TreeNodes>(() => ({ "": rootNode(cwd) }));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<{ loading: boolean; error: string; results: SearchEntry[] }>({ loading: false, error: "", results: [] });
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ path: string; x: number; y: number } | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ action: MutationAction; path: string } | null>(null);
  const [draftName, setDraftName] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [mutationBusy, setMutationBusy] = useState(false);
  const [deleteConfirmPath, setDeleteConfirmPath] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [revealingPath, setRevealingPath] = useState<string | null>(null);
  const nodesRef = useRef(nodes);
  const expandedRef = useRef(expanded);
  const showHiddenRef = useRef(showHidden);
  const workspaceVersionRef = useRef(0);
  const requestIdsRef = useRef(new Map<string, number>());
  const copyTimerRef = useRef<number | null>(null);
  const revealRequestRef = useRef(0);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { expandedRef.current = expanded; }, [expanded]);
  useEffect(() => { showHiddenRef.current = showHidden; }, [showHidden]);

  useEffect(() => {
    if (!newMenuOpen && !contextMenu && !pendingAction && !deleteConfirmPath) return;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(".workspace-file-tree-new, .workspace-file-tree-context-menu, .workspace-file-tree-confirm")) return;
      setNewMenuOpen(false);
      setContextMenu(null);
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNewMenuOpen(false);
        setContextMenu(null);
        setPendingAction(null);
        setDeleteConfirmPath(null);
        setMutationError("");
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", keyDown);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", keyDown);
    };
  }, [contextMenu, deleteConfirmPath, newMenuOpen, pendingAction]);

  useEffect(() => () => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
  }, []);

  const loadDirectory = useCallback(async (relativePath: string, force = false) => {
    const node = nodesRef.current[relativePath];
    if (!node || !node.isDir || (node.loaded && !force)) return;

    const requestId = (requestIdsRef.current.get(relativePath) ?? 0) + 1;
    const workspaceVersion = workspaceVersionRef.current;
    requestIdsRef.current.set(relativePath, requestId);
    const loadingNodes = { ...nodesRef.current, [relativePath]: { ...node, loading: true, error: undefined } };
    nodesRef.current = loadingNodes;
    setNodes(loadingNodes);

    try {
      const directory = relativePath ? joinFilePath(cwd, relativePath) : cwd;
      const response = await fetch(`/api/files/${encodeFilePathForApi(directory)}?type=list${showHiddenRef.current ? "" : "&hideHidden=1"}`);
      const body = await response.json() as { entries?: FileEntry[]; error?: string };
      if (!response.ok) throw new Error(responseError(response.status, body));
      if (workspaceVersion !== workspaceVersionRef.current || requestIdsRef.current.get(relativePath) !== requestId) return;

      const entries = sortEntries(body.entries ?? []);
      const current = nodesRef.current;
      const parent = current[relativePath];
      if (!parent) return;
      const next = { ...current };
      const children = entries.map((entry) => relativePath ? `${relativePath}/${entry.name}` : entry.name);
      const keep = new Set(children);
      for (const oldChild of parent.children) {
        if (keep.has(oldChild)) continue;
        for (const path of Object.keys(next)) {
          if (path === oldChild || path.startsWith(`${oldChild}/`)) delete next[path];
        }
      }
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index];
        const path = children[index];
        const currentChild = current[path];
        next[path] = currentChild && currentChild.isDir === entry.isDir
          ? { ...currentChild, name: entry.name }
          : { path, name: entry.name, isDir: entry.isDir, children: [], loaded: !entry.isDir, loading: false };
      }
      next[relativePath] = { ...parent, children, loaded: true, loading: false, error: undefined };
      nodesRef.current = next;
      setNodes(next);
    } catch (error) {
      if (workspaceVersion !== workspaceVersionRef.current || requestIdsRef.current.get(relativePath) !== requestId) return;
      const current = nodesRef.current;
      const failedNodes = { ...current, [relativePath]: { ...current[relativePath], loading: false, error: error instanceof Error ? error.message : String(error) } };
      nodesRef.current = failedNodes;
      setNodes(failedNodes);
    }
  }, [cwd]);

  useEffect(() => {
    workspaceVersionRef.current++;
    requestIdsRef.current.clear();
    const next = { "": rootNode(cwd) };
    nodesRef.current = next;
    setNodes(next);
    setExpanded(new Set());
    setSelectedPath("");
    setQuery("");
    setNewMenuOpen(false);
    setContextMenu(null);
    setPendingAction(null);
    setDeleteConfirmPath(null);
    setMutationError("");
    setRevealingPath(null);
    void loadDirectory("", true);
  }, [cwd, loadDirectory]);

  useEffect(() => {
    const paths = ["", ...expandedRef.current].filter((path) => nodesRef.current[path]?.isDir);
    void Promise.all(paths.map((path) => loadDirectory(path, true)));
  }, [loadDirectory, showHidden]);

  const refreshVisible = useCallback(() => {
    const paths = ["", ...expandedRef.current].filter((path) => nodesRef.current[path]?.isDir);
    void Promise.all(paths.map((path) => loadDirectory(path, true)));
  }, [loadDirectory]);

  useEffect(() => {
    if (refreshKey === undefined) return;
    refreshVisible();
  }, [refreshKey, refreshVisible]);

  useEffect(() => {
    const interval = window.setInterval(refreshVisible, 10_000);
    return () => window.clearInterval(interval);
  }, [refreshVisible]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearch({ loading: false, error: "", results: [] });
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearch((current) => ({ ...current, loading: true, error: "" }));
      try {
        const response = await fetch(`/api/file-index?cwd=${encodeURIComponent(cwd)}&q=${encodeURIComponent(trimmed)}`, { signal: controller.signal });
        const body = await response.json() as { matches?: SearchEntry[]; error?: string };
        if (!response.ok) throw new Error(responseError(response.status, body));
        setSearch({ loading: false, error: "", results: (body.matches ?? []).filter((entry) => showHidden || !isHiddenPath(entry.path)) });
      } catch (error) {
        if (controller.signal.aborted) return;
        setSearch({ loading: false, error: error instanceof Error ? error.message : String(error), results: [] });
      }
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [cwd, query, showHidden]);

  const toggleDirectory = useCallback((path: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    if (!expanded.has(path)) void loadDirectory(path);
  }, [expanded, loadDirectory]);

  const reveal = useCallback(async (path: string, isDir: boolean, openFile = false) => {
    const segments = path.split("/").filter(Boolean);
    const folders = isDir ? segments : segments.slice(0, -1);
    let parent = "";
    await loadDirectory(parent);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    for (const name of folders) {
      parent = parent ? `${parent}/${name}` : name;
      setExpanded((current) => new Set(current).add(parent));
      await loadDirectory(parent);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
    setSelectedPath(path);
    if (!isDir && openFile) onOpenFile(joinFilePath(cwd, path), path.split("/").pop() ?? path);
  }, [cwd, loadDirectory, onOpenFile]);

  useEffect(() => {
    if (!revealRequest) return;
    const path = getRelativeFilePath(revealRequest.path, cwd);
    if (!path || path === revealRequest.path || path.split("/").some((part) => !part || part === "." || part === "..")) return;
    const requestId = ++revealRequestRef.current;
    setRevealingPath(path);
    void reveal(path, false).finally(() => {
      if (requestId === revealRequestRef.current) setRevealingPath(null);
    });
  }, [cwd, reveal, revealRequest]);

  const startMutation = useCallback((action: MutationAction, path: string) => {
    const node = nodesRef.current[path];
    setNewMenuOpen(false);
    setContextMenu(null);
    setMutationError("");
    setDraftName(action === "rename" ? node?.name ?? "" : "");
    setPendingAction({ action, path });
  }, []);

  const submitMutation = useCallback(async () => {
    if (!pendingAction || mutationBusy) return;
    const { action, path } = pendingAction;
    const name = draftName.trim();
    if (!name) {
      setMutationError("A name is required.");
      return;
    }
    const node = nodesRef.current[path];
    const targetDirectory = action.startsWith("create") ? (node?.isDir ? path : parentPath(path)) : parentPath(path);
    setMutationError("");
    setMutationBusy(true);
    try {
      const response = await fetch("/api/workspace-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, cwd, path: action.startsWith("create") ? targetDirectory : path, name }),
      });
      const body = await response.json() as { path?: string; error?: string };
      if (!response.ok) throw new Error(body.error || `Unable to update files (HTTP ${response.status})`);
      const nextPath = body.path ?? "";
      const refreshPath = parentPath(nextPath);
      await loadDirectory(refreshPath, true);
      setSelectedPath(nextPath);
      if (action === "create-file") onOpenFile(joinFilePath(cwd, nextPath), nextPath.split("/").pop() ?? nextPath);
      setPendingAction(null);
      setDraftName("");
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : String(error));
    } finally {
      setMutationBusy(false);
    }
  }, [cwd, draftName, loadDirectory, mutationBusy, onOpenFile, pendingAction]);

  const deletePath = useCallback(async (path: string) => {
    if (mutationBusy) return;
    setNewMenuOpen(false);
    setContextMenu(null);
    setMutationError("");
    setMutationBusy(true);
    try {
      const response = await fetch("/api/workspace-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", cwd, path }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || `Unable to update files (HTTP ${response.status})`);
      const refreshPath = parentPath(path);
      await loadDirectory(refreshPath, true);
      setSelectedPath(refreshPath);
      setDeleteConfirmPath(null);
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : String(error));
    } finally {
      setMutationBusy(false);
    }
  }, [cwd, loadDirectory, mutationBusy]);

  const copyPath = useCallback(async (relativePath: string) => {
    const fullPath = relativePath ? joinFilePath(cwd, relativePath) : cwd;
    let copied = false;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(fullPath);
      copied = true;
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = fullPath;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      copied = document.execCommand("copy");
      textArea.remove();
    }
    if (!copied) {
      setMutationError("Unable to copy the file path.");
      return;
    }
    setCopiedPath(relativePath);
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => {
      setCopiedPath(null);
      copyTimerRef.current = null;
    }, 1200);
  }, [cwd]);

  const rows = useMemo(() => {
    const result: Array<{ path: string; depth: number }> = [];
    const visit = (path: string, depth: number) => {
      const node = nodes[path];
      if (!node) return;
      result.push({ path, depth });
      if (node.isDir && expanded.has(path)) node.children.forEach((child) => visit(child, depth + 1));
    };
    nodes[""]?.children.forEach((path) => visit(path, 0));
    return result;
  }, [expanded, nodes]);

  return (
    <section className="workspace-file-tree">
      {showToolbar && (
        <div className="workspace-file-tree-toolbar">
          <label className="workspace-file-tree-search">
            <Search size={14} strokeWidth={1.8} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search files" aria-label="Search files" />
            {query && <button type="button" onClick={() => setQuery("")} title="Clear search" aria-label="Clear search"><X size={14} aria-hidden="true" /></button>}
          </label>
          <button type="button" className="workspace-file-tree-icon-button" onClick={() => setExpanded(new Set())} title="Collapse all folders" aria-label="Collapse all folders"><ChevronUp size={15} aria-hidden="true" /></button>
          <button type="button" className="workspace-file-tree-icon-button" onClick={refreshVisible} title="Refresh files" aria-label="Refresh files"><RefreshCw size={14} aria-hidden="true" /></button>
          <button type="button" className={`workspace-file-tree-icon-button${showHidden ? " is-active" : ""}`} onClick={() => setShowHidden((current) => !current)} title={showHidden ? "Hide hidden files" : "Show hidden files"} aria-label={showHidden ? "Hide hidden files" : "Show hidden files"}>{showHidden ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}</button>
          {allowMutations && <div className="workspace-file-tree-new">
            <button type="button" className="workspace-file-tree-icon-button" onClick={() => setNewMenuOpen((open) => !open)} title="New file or folder" aria-label="New file or folder"><Plus size={15} aria-hidden="true" /></button>
            {newMenuOpen && <div role="menu">
              <button type="button" role="menuitem" onClick={() => startMutation("create-file", selectedPath)}>New file</button>
              <button type="button" role="menuitem" onClick={() => startMutation("create-folder", selectedPath)}>New folder</button>
            </div>}
          </div>}
        </div>
      )}

      {pendingAction && <form className="workspace-file-tree-edit" onSubmit={(event) => { event.preventDefault(); void submitMutation(); }}>
        <input autoFocus disabled={mutationBusy} value={draftName} onChange={(event) => setDraftName(event.currentTarget.value)} placeholder={pendingAction.action === "rename" ? "New name" : pendingAction.action === "create-file" ? "New file name" : "New folder name"} aria-label={pendingAction.action === "rename" ? "New name" : pendingAction.action === "create-file" ? "New file name" : "New folder name"} />
        <button type="submit" disabled={mutationBusy} title="Save" aria-label="Save">{mutationBusy ? <LoaderCircle size={14} aria-hidden="true" style={{ animation: "spin 0.8s linear infinite" }} /> : <Check size={14} aria-hidden="true" />}</button>
        <button type="button" disabled={mutationBusy} onClick={() => { setPendingAction(null); setMutationError(""); }} title="Cancel" aria-label="Cancel"><X size={14} aria-hidden="true" /></button>
      </form>}
      {mutationError && <div className="workspace-file-tree-error workspace-file-tree-mutation-error">{mutationError}</div>}
      {revealingPath && <div className="workspace-file-tree-reveal-status" role="status"><span aria-hidden="true" />Revealing {revealingPath}</div>}

      {query.trim() && (
        <div className="workspace-file-tree-results" role="listbox" aria-label="File search results">
          {search.loading && <div className="workspace-file-tree-empty">Searching...</div>}
          {!search.loading && search.error && <div className="workspace-file-tree-error">{search.error}</div>}
          {!search.loading && !search.error && search.results.length === 0 && <div className="workspace-file-tree-empty">No matching files</div>}
          {search.results.map((entry) => (
            <button key={`${entry.isDir}:${entry.path}`} type="button" role="option" aria-selected={selectedPath === entry.path} className="workspace-file-tree-result" onClick={() => void reveal(entry.path, entry.isDir, !entry.isDir)} title={entry.path}>
              {entry.isDir ? <FolderIcon size={14} /> : getFileIcon(entry.path, 14)}
              <span>{entry.path}</span>
            </button>
          ))}
        </div>
      )}

      <div className="workspace-file-tree-scroll" role="tree" aria-label="Workspace files" onContextMenu={(event) => {
        event.preventDefault();
        const panel = event.currentTarget.closest(".workspace-file-tree");
        if (!panel) return;
        const bounds = panel.getBoundingClientRect();
        setSelectedPath("");
        setNewMenuOpen(false);
        setContextMenu({ path: "", x: Math.max(8, Math.min(event.clientX - bounds.left, bounds.width - 196)), y: Math.max(8, Math.min(event.clientY - bounds.top, bounds.height - 280)) });
      }}>
        {rows.map(({ path, depth }) => {
          const node = nodes[path];
          const isExpanded = expanded.has(path);
          return (
            <div key={path} className={`workspace-file-tree-row${selectedPath === path ? " is-selected" : ""}`} role="treeitem" aria-selected={selectedPath === path} aria-expanded={node.isDir ? isExpanded : undefined} style={{ paddingLeft: 8 + depth * 14 }} onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const panel = event.currentTarget.closest(".workspace-file-tree");
              if (!panel) return;
              const bounds = panel.getBoundingClientRect();
              setSelectedPath(path);
              setNewMenuOpen(false);
              setContextMenu({ path, x: Math.max(8, Math.min(event.clientX - bounds.left, bounds.width - 196)), y: Math.max(8, Math.min(event.clientY - bounds.top, bounds.height - 280)) });
            }}>
              {node.isDir ? (
                <button type="button" className="workspace-file-tree-toggle" onClick={() => toggleDirectory(path)} title={isExpanded ? "Collapse folder" : "Expand folder"} aria-label={isExpanded ? "Collapse folder" : "Expand folder"} aria-busy={node.loading}>{node.loading ? <span className="workspace-file-tree-toggle-spinner" /> : <ChevronRight size={14} strokeWidth={1.8} aria-hidden="true" style={{ transform: isExpanded ? "rotate(90deg)" : "none" }} />}</button>
              ) : <span className="workspace-file-tree-toggle" />}
              <button type="button" className="workspace-file-tree-name" onClick={() => {
                setSelectedPath(path);
                if (isMobile && !node.isDir) onOpenFile(joinFilePath(cwd, path), node.name);
              }} onDoubleClick={() => node.isDir ? toggleDirectory(path) : onOpenFile(joinFilePath(cwd, path), node.name)} onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                if (node.isDir) toggleDirectory(path);
                else onOpenFile(joinFilePath(cwd, path), node.name);
              }} title={path}>
                {node.isDir ? <FolderIcon size={15} open={isExpanded} /> : getFileIcon(node.name, 14)}
                <span>{node.name}</span>
              </button>
              {onAtMention && <button type="button" className="workspace-file-tree-row-action" onClick={() => onAtMention(getRelativeFilePath(joinFilePath(cwd, path), cwd), node.isDir)} title="Insert into chat" aria-label={`Insert ${path} into chat`}><AtSign size={13} aria-hidden="true" /></button>}
              {node.error && <span className="workspace-file-tree-row-error" title={node.error}>!</span>}
            </div>
          );
        })}
        {nodes[""]?.loading && rows.length === 0 && <div className="workspace-file-tree-empty">Loading files...</div>}
        {!nodes[""]?.loading && nodes[""].error && <div className="workspace-file-tree-error">{nodes[""].error}</div>}
        {!nodes[""]?.loading && !nodes[""].error && rows.length === 0 && <div className="workspace-file-tree-empty">No files found</div>}
      </div>

      {contextMenu && (() => {
        const node = nodes[contextMenu.path] ?? nodes[""];
        const name = contextMenu.path ? node?.name ?? contextMenu.path : "workspace";
        const canMutate = allowMutations && !mutationBusy;
        return <div className="workspace-file-tree-context-menu" role="menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          {!node?.isDir && <button type="button" role="menuitem" onClick={() => { onOpenFile(joinFilePath(cwd, contextMenu.path), name); setContextMenu(null); }}>Open file</button>}
          {allowMutations && <>
            <button type="button" role="menuitem" disabled={!canMutate} onClick={() => startMutation("create-file", contextMenu.path)}>New file</button>
            <button type="button" role="menuitem" disabled={!canMutate} onClick={() => startMutation("create-folder", contextMenu.path)}>New folder</button>
            {contextMenu.path && <>
              <button type="button" role="menuitem" disabled={!canMutate} onClick={() => startMutation("rename", contextMenu.path)}>Rename</button>
              <button type="button" role="menuitem" className="is-danger" disabled={!canMutate} onClick={() => { setDeleteConfirmPath(contextMenu.path); setContextMenu(null); }}>Delete</button>
            </>}
            <hr />
          </>}
          <button type="button" role="menuitemcheckbox" aria-checked={showHidden} onClick={() => { setShowHidden((current) => !current); setContextMenu(null); }}>{showHidden ? "Hide hidden files" : "Show hidden files"}</button>
          <button type="button" role="menuitem" onClick={() => void copyPath(contextMenu.path)}>{copiedPath === contextMenu.path ? "Path copied" : "Copy full path"}</button>
          {onAtMention && contextMenu.path && <button type="button" role="menuitem" onClick={() => { onAtMention(getRelativeFilePath(joinFilePath(cwd, contextMenu.path), cwd), Boolean(node?.isDir)); setContextMenu(null); }}>Insert into chat</button>}
          <hr />
          <button type="button" role="menuitem" onClick={() => { void loadDirectory(node?.isDir ? contextMenu.path : parentPath(contextMenu.path), true); setContextMenu(null); }}>Refresh</button>
        </div>;
      })()}

      {deleteConfirmPath && <div className="workspace-file-tree-confirm" role="alertdialog" aria-modal="true" aria-label="Confirm deletion">
        <strong>Delete {nodes[deleteConfirmPath]?.name ?? deleteConfirmPath}?</strong>
        <span>This cannot be undone.</span>
        <div><button type="button" disabled={mutationBusy} onClick={() => void deletePath(deleteConfirmPath)}>{mutationBusy ? "Deleting..." : "Delete"}</button><button type="button" disabled={mutationBusy} onClick={() => setDeleteConfirmPath(null)}>Cancel</button></div>
      </div>}
    </section>
  );
}
