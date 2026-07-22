"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { TabBar, type Tab } from "../TabBar";
import { FileTab } from "./FileTab";
import { getRightPanelTool, rightPanelTools } from "./tool-registry";
import type { FilePanelTab, RightPanelHandle, RightPanelTab, ToolPanelTab } from "./types";

interface Props {
  workspaceCwd: string | null;
  workspaceProjectRoot: string | null;
  sourceSessionId: string | null;
  explorerRefreshKey: number;
  onAtMention: (relativePath: string, isDir: boolean) => void;
  onPanelOpened: () => void;
}

type SavedPanelState = {
  fileTabs: FilePanelTab[];
  toolTabs: ToolPanelTab[];
  activeTabId: string | null;
  panelOpen: boolean;
};

function loadPanelState(cwd: string): SavedPanelState | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(`pi-right-panel:${cwd}`) ?? "null") as Partial<SavedPanelState> | null;
    if (!saved || !Array.isArray(saved.fileTabs) || !Array.isArray(saved.toolTabs)) return null;
    const fileTabs = saved.fileTabs.filter((tab): tab is FilePanelTab => Boolean(tab && tab.type === "file" && typeof tab.id === "string" && typeof tab.label === "string" && typeof tab.filePath === "string" && typeof tab.workspaceCwd === "string"));
    // PTYs are restored from the server registry. Keeping them here could recreate
    // one after the server has been restarted and the original process is gone.
    const toolTabs = saved.toolTabs.filter((tab): tab is ToolPanelTab => Boolean(tab && tab.type === "tool" && tab.toolId !== "terminal" && typeof tab.id === "string" && typeof tab.toolId === "string" && typeof tab.cwd === "string" && (tab.label === undefined || typeof tab.label === "string") && getRightPanelTool(tab.toolId)));
    const tabs = [...toolTabs, ...fileTabs];
    const activeTabId = typeof saved.activeTabId === "string" && tabs.some((tab) => tab.id === saved.activeTabId) ? saved.activeTabId : (tabs.length > 0 ? tabs[tabs.length - 1].id : null);
    return { fileTabs, toolTabs, activeTabId, panelOpen: saved.panelOpen === true };
  } catch {
    return null;
  }
}

function PanelIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  );
}

function AddToolIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function FullscreenIcon({ exit = false }: { exit?: boolean }) {
  return exit ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 4v5H4m11-5v5h5M9 20v-5H4m16 5v-5h-5" /></svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 4H4v5m11-5h5v5M9 20H4v-5m11 5h5v-5" /></svg>
  );
}

function ToolLauncher({ disabled, onOpenTool }: { disabled: boolean; onOpenTool: (toolId: string) => void }) {
  return (
    <div className="right-panel-launcher">
      <div className="right-panel-launcher-heading">
        <h2>开始使用 Pi Agent Web</h2>
        <p>选择一个工具开始你的智能开发之旅</p>
      </div>
      <div className="right-panel-launcher-list">
        {rightPanelTools.map((tool) => {
          const Icon = tool.Icon;
          return (
            <button key={tool.id} type="button" className="right-panel-launcher-item" disabled={disabled} onClick={() => onOpenTool(tool.id)}>
              <span className="right-panel-launcher-icon"><Icon size={25} /></span>
              <span>
                <strong>新建{tool.label}</strong>
                <small>{tool.description}</small>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const RightPanel = forwardRef<RightPanelHandle, Props>(function RightPanel({
  workspaceCwd,
  workspaceProjectRoot,
  sourceSessionId,
  explorerRefreshKey,
  onAtMention,
  onPanelOpened,
}, ref) {
  const [fileTabs, setFileTabs] = useState<FilePanelTab[]>([]);
  const [toolTabs, setToolTabs] = useState<ToolPanelTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [fileTreeRevealRequest, setFileTreeRevealRequest] = useState<{ path: string; id: number } | null>(null);
  const [restoredProject, setRestoredProject] = useState<string | null>(null);
  const [panelFullscreen, setPanelFullscreen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const projectRef = useRef<string | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!panelFullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanelFullscreen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [panelFullscreen]);

  useEffect(() => {
    if (!workspaceCwd) {
      setFileTabs([]);
      setToolTabs([]);
      setActiveTabId(null);
      setPanelOpen(false);
      setPanelFullscreen(false);
      setMenuOpen(false);
      setFileTreeRevealRequest(null);
      setRestoredProject(null);
      projectRef.current = null;
      return;
    }
    const project = workspaceProjectRoot ?? workspaceCwd;
    if (projectRef.current === project) {
      setFileTabs((previous) => previous.map((tab) => ({ ...tab, workspaceCwd })));
      setToolTabs((previous) => previous.map((tab) => getRightPanelTool(tab.toolId)?.preserveCwdOnWorkspaceChange ? tab : { ...tab, cwd: workspaceCwd }));
      setMenuOpen(false);
      setFileTreeRevealRequest(null);
      return;
    }
    const saved = loadPanelState(project);
    setFileTabs(saved?.fileTabs ?? []);
    setToolTabs(saved?.toolTabs ?? []);
    setActiveTabId(saved?.activeTabId ?? null);
    setPanelOpen(saved?.panelOpen ?? window.matchMedia("(min-width: 641px)").matches);
    setMenuOpen(false);
    setFileTreeRevealRequest(null);
    projectRef.current = project;
    setRestoredProject(project);
  }, [workspaceCwd, workspaceProjectRoot]);

  useEffect(() => {
    const project = workspaceProjectRoot ?? workspaceCwd;
    if (!project || restoredProject !== project) return;
    try {
      window.localStorage.setItem(`pi-right-panel:${project}`, JSON.stringify({ fileTabs, toolTabs, activeTabId, panelOpen }));
    } catch {
      // Storage can be unavailable in private browsing; tabs still work for this page.
    }
  }, [activeTabId, fileTabs, panelOpen, restoredProject, toolTabs, workspaceCwd, workspaceProjectRoot]);

  useEffect(() => {
    const project = workspaceProjectRoot ?? workspaceCwd;
    if (!project) return;
    let cancelled = false;
    void fetch(`/api/terminal?projectRoot=${encodeURIComponent(project)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not restore terminals");
        return response.json() as Promise<{ terminals?: Array<{ id: string; cwd: string; title: string }> }>;
      })
      .then(({ terminals = [] }) => {
        if (cancelled || projectRef.current !== project) return;
        setToolTabs((previous) => {
          const known = new Set(previous.map((tab) => tab.id));
          const restored = terminals
            .filter((terminal) => !known.has(terminal.id))
            .map((terminal) => ({ id: terminal.id, type: "tool" as const, toolId: "terminal", cwd: terminal.cwd, label: terminal.title }));
          return restored.length > 0 ? [...previous, ...restored] : previous;
        });
        if (terminals.length > 0) {
          setActiveTabId((current) => current ?? terminals[0].id);
          setPanelOpen(true);
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [workspaceCwd, workspaceProjectRoot]);

  const openPanel = useCallback(() => {
    setPanelOpen(true);
    onPanelOpened();
  }, [onPanelOpened]);

  const toggleFullscreen = useCallback(() => setPanelFullscreen((current) => !current), []);

  const openFile = useCallback((filePath: string, fileName: string, fileSourceSessionId?: string | null, cwd = workspaceCwd) => {
    if (!cwd) return;
    const id = `file:${filePath}`;
    setFileTabs((previous) => {
      const existing = previous.find((tab) => tab.id === id);
      if (!existing) {
        return [...previous, { id, type: "file", label: fileName, filePath, sourceSessionId: fileSourceSessionId, workspaceCwd: cwd }];
      }
      if (!fileSourceSessionId || existing.sourceSessionId === fileSourceSessionId) return previous;
      return previous.map((tab) => tab.id === id ? { ...tab, sourceSessionId: fileSourceSessionId, workspaceCwd: cwd } : tab);
    });
    setActiveTabId(id);
    openPanel();
  }, [openPanel, workspaceCwd]);

  useImperativeHandle(ref, () => ({ openFile }), [openFile]);

  const openTool = useCallback((toolId: string) => {
    if (!workspaceCwd) return;
    const tool = getRightPanelTool(toolId);
    if (!tool) return;
    const id = tool.allowMultipleTabs
      ? `tool:${toolId}:${typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`}`
      : `tool:${toolId}`;
    setToolTabs((previous) => previous.some((tab) => tab.id === id)
      ? previous
      : [...previous, {
        id,
        type: "tool",
        toolId,
        cwd: workspaceCwd,
        ...(tool.allowMultipleTabs ? { label: `${tool.label} ${previous.filter((tab) => tab.toolId === toolId).length + 1}` } : {}),
      }]);
    setActiveTabId(id);
    setMenuOpen(false);
    openPanel();
  }, [openPanel, workspaceCwd]);

  const revealInFileTree = useCallback((filePath: string) => {
    if (!workspaceCwd) return;
    setFileTreeRevealRequest((current) => ({ path: filePath, id: (current?.id ?? 0) + 1 }));
    openTool("file-tree");
  }, [openTool, workspaceCwd]);

  const closeTab = useCallback((tabId: string) => {
    if (tabId.startsWith("tool:")) {
      const tab = toolTabs.find((candidate) => candidate.id === tabId);
      const removeToolTab = () => setToolTabs((previous) => {
        const next = previous.filter((tab) => tab.id !== tabId);
        if (activeTabId === tabId) {
          const remaining = [...next, ...fileTabs];
          setActiveTabId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
        }
        return next;
      });
      const close = tab && getRightPanelTool(tab.toolId)?.onCloseTab;
      if (tab && close) {
        void Promise.resolve(close(tab)).then((closed) => {
          if (closed) removeToolTab();
        }).catch(() => undefined);
      } else {
        removeToolTab();
      }
      return;
    }

    setFileTabs((previous) => {
      const next = previous.filter((tab) => tab.id !== tabId);
      if (activeTabId === tabId) {
        const remaining = [...toolTabs, ...next];
        setActiveTabId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
      }
      return next;
    });
  }, [activeTabId, fileTabs, toolTabs]);

  const tabs: RightPanelTab[] = [...toolTabs, ...fileTabs];
  const tabBarTabs: Tab[] = tabs.flatMap<Tab>((tab) => {
    if (tab.type === "file") {
      return [{
        id: tab.id,
        label: tab.label,
        filePath: tab.filePath,
        sourceSessionId: tab.sourceSessionId,
      }];
    }
    const tool = getRightPanelTool(tab.toolId);
    if (!tool) return [];
    const Icon = tool.Icon;
    return [{ id: tab.id, label: tab.label ?? tool.label, filePath: tab.cwd, icon: <Icon size={14} /> }];
  });
  const activeToolTab = toolTabs.find((tab) => tab.id === activeTabId) ?? null;
  const activeTool = activeToolTab ? getRightPanelTool(activeToolTab.toolId) : null;
  const ActiveToolComponent = activeTool?.Component;
  const activeFileTab = fileTabs.find((tab) => tab.id === activeTabId) ?? null;

  return (
    <>
      <div
        className={`right-panel-container glass-file-panel${panelOpen ? " right-panel-open" : " right-panel-closed"}${panelFullscreen ? " right-panel-fullscreen" : ""}`}
        style={{ display: "flex", flexDirection: "column", borderLeft: "1px solid var(--border)", background: "var(--bg)" }}
      >
        <div className="right-panel-toolbar">
          <div className="right-panel-toolbar-tabs">
            {tabBarTabs.length > 0 && (
              <TabBar
                tabs={tabBarTabs}
                activeTabId={activeTabId ?? ""}
                onSelectTab={setActiveTabId}
                onCloseTab={closeTab}
              />
            )}
          </div>
          <div ref={menuRef} className="right-panel-toolbar-actions">
            <button type="button" className="right-panel-action" onClick={toggleFullscreen} title={panelFullscreen ? "退出全屏" : "全屏"} aria-label={panelFullscreen ? "退出全屏" : "全屏"}>
              <FullscreenIcon exit={panelFullscreen} />
            </button>
            <button type="button" className="right-panel-action" onClick={() => { setPanelFullscreen(false); setPanelOpen(false); setMenuOpen(false); }} title="关闭工具面板" aria-label="关闭工具面板">
              <PanelIcon size={16} />
            </button>
            <button type="button" className="right-panel-action" onClick={() => setMenuOpen((open) => !open)} title="新建工具" aria-label="新建工具" aria-expanded={menuOpen}>
              <AddToolIcon />
            </button>
            {menuOpen && (
              <div className="right-panel-create-menu" role="menu" aria-label="新建工具">
                {rightPanelTools.map((tool) => {
                  const Icon = tool.Icon;
                  return (
                    <button key={tool.id} type="button" role="menuitem" disabled={!workspaceCwd} onClick={() => openTool(tool.id)}>
                      <Icon size={17} />
                      <span>新建{tool.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="right-panel-content">
          {activeToolTab && ActiveToolComponent ? (
            <div className="right-panel-tool-content">
              <ActiveToolComponent
                tabId={activeToolTab.id}
                tabLabel={activeToolTab.label ?? activeTool.label}
                cwd={activeToolTab.cwd}
                projectRoot={workspaceProjectRoot ?? activeToolTab.cwd}
                sourceSessionId={sourceSessionId}
                explorerRefreshKey={explorerRefreshKey}
                fileTreeRevealRequest={fileTreeRevealRequest}
                onOpenFile={(filePath, fileName) => openFile(filePath, fileName, sourceSessionId, activeToolTab.cwd)}
                onAtMention={onAtMention}
                onRevealInFileTree={revealInFileTree}
              />
            </div>
          ) : activeFileTab ? (
            <FileTab tab={activeFileTab} onOpenFile={openFile} />
          ) : (
            <ToolLauncher disabled={!workspaceCwd} onOpenTool={openTool} />
          )}
        </div>
      </div>
      {!panelOpen && (
        <button type="button" className="right-panel-open-button" onClick={openPanel} title="打开工具面板" aria-label="打开工具面板">
          <PanelIcon />
        </button>
      )}
    </>
  );
});

RightPanel.displayName = "RightPanel";
