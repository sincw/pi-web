"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { TabBar, type Tab } from "../TabBar";
import { FileTab } from "./FileTab";
import { getRightPanelTool, rightPanelTools } from "./tool-registry";
import type { FilePanelTab, OpenDiffFileArgs, RightPanelHandle, RightPanelTab, ToolPanelTab } from "./types";

interface Props {
  workspaceCwd: string | null;
  sourceSessionId: string | null;
  explorerRefreshKey: number;
  onAtMention: (relativePath: string, isDir: boolean) => void;
  onPanelOpened: () => void;
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
  const menuRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpen]);

  useEffect(() => {
    if (window.matchMedia("(min-width: 641px)").matches) setPanelOpen(true);
  }, []);

  useEffect(() => {
    const previousWorkspace = workspaceRef.current;
    if (previousWorkspace !== undefined && previousWorkspace !== workspaceCwd) {
      setFileTabs([]);
      setToolTabs([]);
      setActiveTabId(null);
      setMenuOpen(false);
    }
    workspaceRef.current = workspaceCwd;
  }, [workspaceCwd]);

  const openPanel = useCallback(() => {
    setPanelOpen(true);
    onPanelOpened();
  }, [onPanelOpened]);

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

  const openDiffFile = useCallback((args: OpenDiffFileArgs, cwd = workspaceCwd) => {
    if (!cwd) return;
    const id = `file:${args.filePath}#${args.section}`;
    setFileTabs((previous) => {
      const existing = previous.find((tab) => tab.id === id);
      const nextTab: FilePanelTab = {
        id,
        type: "file",
        label: args.fileName,
        filePath: args.filePath,
        diffOldContent: args.oldContent,
        diffNewContent: args.newContent,
        diffSection: args.section,
        workspaceCwd: cwd,
      };
      if (!existing) return [...previous, nextTab];
      return previous.map((tab) => tab.id === id ? nextTab : tab);
    });
    setActiveTabId(id);
    openPanel();
  }, [openPanel, workspaceCwd]);

  useImperativeHandle(ref, () => ({ openFile }), [openFile]);

  const openTool = useCallback((toolId: string) => {
    if (!workspaceCwd || !getRightPanelTool(toolId)) return;
    const id = `tool:${toolId}`;
    setToolTabs((previous) => previous.some((tab) => tab.id === id)
      ? previous
      : [...previous, { id, type: "tool", toolId, cwd: workspaceCwd }]);
    setActiveTabId(id);
    setMenuOpen(false);
    openPanel();
  }, [openPanel, workspaceCwd]);

  const closeTab = useCallback((tabId: string) => {
    if (tabId.startsWith("tool:")) {
      setToolTabs((previous) => {
        const next = previous.filter((tab) => tab.id !== tabId);
        if (activeTabId === tabId) {
          const remaining = [...next, ...fileTabs];
          setActiveTabId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
        }
        return next;
      });
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
        diffOldContent: tab.diffOldContent,
        diffNewContent: tab.diffNewContent,
        diffSection: tab.diffSection,
      }];
    }
    const tool = getRightPanelTool(tab.toolId);
    if (!tool) return [];
    const Icon = tool.Icon;
    return [{ id: tab.id, label: tool.label, filePath: tab.cwd, icon: <Icon size={14} /> }];
  });
  const activeToolTab = toolTabs.find((tab) => tab.id === activeTabId) ?? null;
  const activeTool = activeToolTab ? getRightPanelTool(activeToolTab.toolId) : null;
  const ActiveToolComponent = activeTool?.Component;
  const activeFileTab = fileTabs.find((tab) => tab.id === activeTabId) ?? null;

  return (
    <>
      <div
        className={`right-panel-container glass-file-panel${panelOpen ? " right-panel-open" : " right-panel-closed"}`}
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
            <button type="button" className="right-panel-action" onClick={() => { setPanelOpen(false); setMenuOpen(false); }} title="关闭工具面板" aria-label="关闭工具面板">
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
                cwd={activeToolTab.cwd}
                sourceSessionId={sourceSessionId}
                explorerRefreshKey={explorerRefreshKey}
                onOpenFile={(filePath, fileName) => openFile(filePath, fileName, sourceSessionId, activeToolTab.cwd)}
                onOpenDiffFile={(args) => openDiffFile(args, activeToolTab.cwd)}
                onAtMention={onAtMention}
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
