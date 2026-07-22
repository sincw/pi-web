"use client";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useCallback, useEffect, useRef, useState } from "react";
import { FolderIcon } from "../FileIcons";
import { getTerminalPopoverPlacement } from "@/lib/terminal-fab-layout";
import { getTerminalVisibleHeight } from "@/lib/terminal-visual-viewport";
import {
  createTerminalFavoriteFolder,
  deleteTerminalFavoriteFolder,
  hasTerminalFavorite,
  readTerminalCommandFavorites,
  renameTerminalFavoriteFolder,
  removeTerminalFavorite,
  saveTerminalFavorite,
  type TerminalCommandFavorites,
} from "@/lib/terminal-command-favorites";
import { applyTerminalModifier, type TerminalModifier } from "@/lib/terminal-mobile-input";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useTheme } from "@/hooks/useTheme";
import type { RightPanelToolDefinition, RightPanelToolProps, ToolPanelTab } from "./types";

function TerminalIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 6 5 5-5 5M13 17h6" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5M12 7v5l3 2" />
    </svg>
  );
}

function StarIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
    </svg>
  );
}

function FolderAddIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /><path d="M15 11v6M12 14h6" /></svg>;
}

function PencilIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14.5 5.5 4 4M4 20l4.3-1 10.9-10.9a2.8 2.8 0 0 0-4-4L4.3 15z" /></svg>;
}

function TrashIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v5M14 11v5M9 7l1-3h4l1 3M6 7l1 13h10l1-13" /></svg>;
}

function ActionIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
  ) : (
    <TerminalIcon size={20} />
  );
}

type MobilePanel = "history" | "favorites" | null;
const COMMANDS_PER_PAGE = 5;
const MAX_HISTORY_PAGES = 10;

function commandFavoritesKey(projectRoot: string) {
  return `pi-terminal-favorites:${projectRoot}`;
}

function newFavoriteFolderId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function terminalTheme(isDark: boolean) {
  return isDark
    ? { background: "#11151d", foreground: "#d7dee9", cursor: "#aab7c9", selectionBackground: "#30405a" }
    : { background: "#f8faff", foreground: "#1f2937", cursor: "#475569", selectionBackground: "#cfe0ff" };
}

function terminalUrl(tabId: string) {
  return `/api/terminal/${encodeURIComponent(tabId)}`;
}

function TerminalTool({ cwd, projectRoot, tabId, tabLabel }: RightPanelToolProps) {
  const { isDark } = useTheme();
  const isMobile = useIsMobile();
  const toolRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const terminalViewportRef = useRef<HTMLElement | null>(null);
  const fitTerminalRef = useRef<() => void>(() => {});
  const pasteInputRef = useRef<HTMLTextAreaElement>(null);
  const sendInputRef = useRef<(data: string) => void>(() => {});
  const terminalModifierRef = useRef<TerminalModifier | null>(null);
  const dragRef = useRef<{ pointerId: number; clientX: number; clientY: number; left: number; top: number } | null>(null);
  const draggedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyPage, setHistoryPage] = useState(0);
  const [favorites, setFavorites] = useState<TerminalCommandFavorites>({ folders: [] });
  const [favoritesProject, setFavoritesProject] = useState<string | null>(null);
  const [folderPage, setFolderPage] = useState(0);
  const [favoriteFolderId, setFavoriteFolderId] = useState<string | null>(null);
  const [favoritePage, setFavoritePage] = useState(0);
  const [favoriteCommand, setFavoriteCommand] = useState<string | null>(null);
  const [folderDraftOpen, setFolderDraftOpen] = useState(false);
  const [folderDraft, setFolderDraft] = useState("");
  const [folderEditingId, setFolderEditingId] = useState<string | null>(null);
  const [fabPosition, setFabPosition] = useState<{ left: number; top: number } | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [terminalModifier, setTerminalModifier] = useState<TerminalModifier | null>(null);

  const setStickyModifier = useCallback((modifier: TerminalModifier | null) => {
    terminalModifierRef.current = modifier;
    setTerminalModifier(modifier);
  }, []);
  const consumeStickyModifier = useCallback((data: string) => {
    const modifier = terminalModifierRef.current;
    if (!modifier || !data) return data;
    setStickyModifier(null);
    return applyTerminalModifier(modifier, data);
  }, [setStickyModifier]);
  const toggleStickyModifier = useCallback((modifier: TerminalModifier) => {
    setStickyModifier(terminalModifierRef.current === modifier ? null : modifier);
    requestAnimationFrame(() => terminalRef.current?.focus());
  }, [setStickyModifier]);

  const visibleHistory = history.slice(0, COMMANDS_PER_PAGE * MAX_HISTORY_PAGES);
  const historyPages = Math.max(1, Math.ceil(visibleHistory.length / COMMANDS_PER_PAGE));
  const historyCommands = visibleHistory.slice(historyPage * COMMANDS_PER_PAGE, historyPage * COMMANDS_PER_PAGE + COMMANDS_PER_PAGE);
  const folderPages = Math.max(1, Math.ceil(favorites.folders.length / COMMANDS_PER_PAGE));
  const favoriteFolders = favorites.folders.slice(folderPage * COMMANDS_PER_PAGE, folderPage * COMMANDS_PER_PAGE + COMMANDS_PER_PAGE);
  const favoriteFolder = favorites.folders.find((folder) => folder.id === favoriteFolderId) ?? null;
  const favoritePages = Math.max(1, Math.ceil((favoriteFolder?.commands.length ?? 0) / COMMANDS_PER_PAGE));
  const favoriteCommands = favoriteFolder?.commands.slice(favoritePage * COMMANDS_PER_PAGE, favoritePage * COMMANDS_PER_PAGE + COMMANDS_PER_PAGE) ?? [];
  const folderNameTaken = favorites.folders.some((folder) => folder.id !== folderEditingId && folder.name === folderDraft.trim());

  useEffect(() => {
    setFavoritesProject(null);
    setHistoryPage(0);
    setFolderPage(0);
    setFavoriteFolderId(null);
    setFavoritePage(0);
    setFavoriteCommand(null);
    setFolderDraftOpen(false);
    setFolderDraft("");
    setFolderEditingId(null);
    try {
      const stored = JSON.parse(window.localStorage.getItem(commandFavoritesKey(projectRoot)) ?? "[]") as unknown;
      setFavorites(readTerminalCommandFavorites(stored));
    } catch {
      setFavorites({ folders: [] });
    }
    setFavoritesProject(projectRoot);
  }, [projectRoot]);

  useEffect(() => {
    if (favoritesProject !== projectRoot) return;
    try {
      window.localStorage.setItem(commandFavoritesKey(projectRoot), JSON.stringify(favorites));
    } catch {
      // Favorites remain available until this page is closed when storage is unavailable.
    }
  }, [favorites, favoritesProject, projectRoot]);

  useEffect(() => {
    setHistoryPage((page) => Math.min(page, historyPages - 1));
  }, [historyPages]);

  useEffect(() => {
    setFolderPage((page) => Math.min(page, folderPages - 1));
  }, [folderPages]);

  useEffect(() => {
    setFavoritePage((page) => Math.min(page, favoritePages - 1));
  }, [favoritePages]);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.options.theme = terminalTheme(isDark);
    if (terminalViewportRef.current) terminalViewportRef.current.style.background = terminalTheme(isDark).background;
  }, [isDark]);

  useEffect(() => {
    if (pasteOpen) requestAnimationFrame(() => pasteInputRef.current?.focus());
  }, [pasteOpen]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let frame: number | null = null;
    const syncVisibleHeight = () => {
      const tool = toolRef.current;
      if (!tool) return;
      const visibleHeight = getTerminalVisibleHeight(window.innerHeight, viewport.height, viewport.offsetTop, tool.getBoundingClientRect().top);
      tool.style.height = visibleHeight === null ? "" : `${visibleHeight}px`;
      if (visibleHeight === null) return;
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => terminalRef.current?.scrollToBottom());
    };
    syncVisibleHeight();
    viewport.addEventListener("resize", syncVisibleHeight);
    viewport.addEventListener("scroll", syncVisibleHeight);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", syncVisibleHeight);
      viewport.removeEventListener("scroll", syncVisibleHeight);
      if (toolRef.current) toolRef.current.style.height = "";
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let input = "";
    let inputTimer: number | null = null;
    let resizeTimer: number | null = null;
    let touchScrolling = false;
    let touchCancelled = false;
    let touchX = 0;
    let touchY = 0;
    let touchRemainder = 0;
    const terminal = new Terminal({
      cursorBlink: true,
      cursorInactiveStyle: "outline",
      fontFamily: "var(--font-mono)",
      fontSize: 13,
      lineHeight: 1.35,
      scrollback: 2000,
      theme: terminalTheme(isDark),
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);
    terminalRef.current = terminal;
    const terminalViewport = container.querySelector<HTMLElement>(".xterm-viewport");
    if (terminalViewport) terminalViewport.style.background = terminalTheme(isDark).background;
    terminalViewportRef.current = terminalViewport;

    let source: EventSource | null = null;
    const start = fetch(terminalUrl(tabId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cwd, projectRoot, title: tabLabel, cols: terminal.cols, rows: terminal.rows }),
    }).then(async (response) => {
      const payload = await response.json() as { error?: string; history?: string[] };
      if (!response.ok) throw new Error(payload.error || "Could not start terminal");
      if (disposed) return;
      setHistory(Array.isArray(payload.history) ? payload.history : []);
      source = new EventSource(`${terminalUrl(tabId)}/events`);
      source.addEventListener("snapshot", (event) => {
        const payload = JSON.parse((event as MessageEvent<string>).data) as { output: string; running: boolean; exitCode: number | null };
        terminal.reset();
        terminal.write(payload.output);
        terminal.options.disableStdin = !payload.running;
        if (!payload.running) terminal.write(`\r\n[终端已退出，状态码 ${payload.exitCode ?? "未知"}]\r\n`);
      });
      source.addEventListener("data", (event) => terminal.write((JSON.parse((event as MessageEvent<string>).data) as { data: string }).data));
      source.addEventListener("exit", (event) => {
        const { exitCode } = JSON.parse((event as MessageEvent<string>).data) as { exitCode: number | null };
        terminal.options.disableStdin = true;
        terminal.write(`\r\n[终端已退出，状态码 ${exitCode ?? "未知"}]\r\n`);
      });
      source.onerror = () => {
        // EventSource reconnects automatically; the next snapshot restores output after a reload.
      };
    });
    void start.catch((reason: unknown) => {
      if (!disposed) setError(reason instanceof Error ? reason.message : "Could not start terminal");
    });
    let patchQueue = Promise.resolve();
    const patch = (body: Record<string, unknown>) => {
      const request = patchQueue.then(() => start).then(() => fetch(terminalUrl(tabId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })).then(async (response) => {
        const payload = await response.json() as { error?: string; history?: string[] };
        if (!response.ok) throw new Error(payload.error || "Terminal request failed");
        if (!disposed && Array.isArray(payload.history)) setHistory(payload.history);
      });
      patchQueue = request.catch(() => undefined);
      return request;
    };

    const flushInput = () => {
      if (inputTimer !== null) window.clearTimeout(inputTimer);
      inputTimer = null;
      if (!input) return;
      const data = input;
      input = "";
      void patch({ data }).catch((reason: unknown) => {
        if (!disposed) setError(reason instanceof Error ? reason.message : "Terminal input failed");
      });
    };
    const sendInput = (data: string) => {
      flushInput();
      void patch({ data }).catch((reason: unknown) => {
        if (!disposed) setError(reason instanceof Error ? reason.message : "Terminal input failed");
      });
    };
    sendInputRef.current = sendInput;
    const fitAndResize = () => {
      if (disposed || !container.getClientRects().length) return;
      try {
        fit.fit();
        void patch({ cols: terminal.cols, rows: terminal.rows }).catch(() => undefined);
      } catch {
        // xterm has no dimensions while a panel transition is in progress.
      }
    };
    fitTerminalRef.current = fitAndResize;
    const scheduleResize = () => {
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(fitAndResize, 40);
    };
    const resizeObserver = new ResizeObserver(scheduleResize);
    resizeObserver.observe(container);
    const inputSubscription = terminal.onData((data) => {
      input += consumeStickyModifier(data);
      if (input.length >= 4096) flushInput();
      else if (inputTimer === null) inputTimer = window.setTimeout(flushInput, 8);
    });
    const focus = () => terminal.focus();
    const onTouchStart = (event: TouchEvent) => {
      // Mobile browsers only open the IME when this happens in the touch gesture.
      terminal.focus();
      const touch = event.touches[0];
      touchScrolling = false;
      touchCancelled = event.touches.length !== 1 || !touch;
      touchRemainder = 0;
      if (touch) {
        touchX = touch.clientX;
        touchY = touch.clientY;
      }
    };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touchCancelled || event.touches.length !== 1 || !touch) return;
      const deltaX = touch.clientX - touchX;
      const deltaY = touch.clientY - touchY;
      if (!touchScrolling) {
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 8) {
          touchCancelled = true;
          return;
        }
        if (Math.abs(deltaY) < 8) return;
        touchScrolling = true;
      }
      touchX = touch.clientX;
      touchY = touch.clientY;
      touchRemainder -= deltaY;
      const rowHeight = Math.max(8, container.clientHeight / Math.max(1, terminal.rows));
      const rows = Math.trunc(touchRemainder / rowHeight);
      if (rows) {
        terminal.scrollLines(rows);
        touchRemainder -= rows * rowHeight;
      }
      event.preventDefault();
    };
    const onTouchEnd = () => {
      touchScrolling = false;
      touchCancelled = false;
      touchRemainder = 0;
    };
    container.addEventListener("pointerdown", focus);
    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd);
    container.addEventListener("touchcancel", onTouchEnd);

    window.setTimeout(scheduleResize, 0);
    return () => {
      disposed = true;
      flushInput();
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      inputSubscription.dispose();
      container.removeEventListener("pointerdown", focus);
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchcancel", onTouchEnd);
      source?.close();
      terminal.dispose();
      if (terminalRef.current === terminal) terminalRef.current = null;
      if (terminalViewportRef.current === terminalViewport) terminalViewportRef.current = null;
      if (sendInputRef.current === sendInput) sendInputRef.current = () => {};
      if (fitTerminalRef.current === fitAndResize) fitTerminalRef.current = () => {};
    };
  }, [consumeStickyModifier, cwd, projectRoot, tabId, tabLabel]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => fitTerminalRef.current());
    return () => window.cancelAnimationFrame(frame);
  }, [isMobile]);

  const sendTerminalInput = (data: string) => sendInputRef.current(consumeStickyModifier(data));
  const selectMobilePanel = (panel: Exclude<MobilePanel, null>) => {
    setActionsOpen(false);
    setMobilePanel(panel);
    setPasteOpen(false);
    setStickyModifier(null);
    if (panel === "favorites") {
      setFolderPage(0);
      setFavoriteFolderId(null);
      setFavoriteCommand(null);
      setFolderDraftOpen(false);
      setFolderEditingId(null);
    }
  };
  const inputCommand = (command: string) => {
    setStickyModifier(null);
    sendInputRef.current(command);
    setMobilePanel(null);
  };
  const pasteToTerminal = () => {
    if (!pasteText) return;
    setStickyModifier(null);
    sendInputRef.current(pasteText);
    setPasteText("");
    setPasteOpen(false);
  };
  const openFavoritePicker = (command: string) => {
    setFavoriteCommand(command);
    setFolderPage(0);
    setFavoriteFolderId(null);
    setFavoritePage(0);
    setFolderEditingId(null);
    setFolderDraftOpen(favorites.folders.length === 0);
    setMobilePanel("favorites");
  };
  const closeFolderEditor = () => {
    setFolderDraftOpen(false);
    setFolderDraft("");
    setFolderEditingId(null);
  };
  const beginFolderRename = (folderId: string, name: string) => {
    setFolderEditingId(folderId);
    setFolderDraft(name);
    setFolderDraftOpen(true);
  };
  const saveFavoriteToFolder = (folderId: string) => {
    if (!favoriteCommand) return;
    setFavorites((current) => saveTerminalFavorite(current, folderId, favoriteCommand));
    setFavoriteCommand(null);
    setMobilePanel("history");
  };
  const saveFavoriteFolder = () => {
    const name = folderDraft.trim();
    if (!name) return;
    if (folderEditingId) {
      setFavorites((current) => renameTerminalFavoriteFolder(current, folderEditingId, name));
      closeFolderEditor();
      return;
    }
    const id = newFavoriteFolderId();
    setFavorites((current) => {
      const existing = current.folders.find((folder) => folder.name === name);
      const folderId = existing?.id ?? id;
      const next = existing ? current : createTerminalFavoriteFolder(current, folderId, name);
      return favoriteCommand ? saveTerminalFavorite(next, folderId, favoriteCommand) : next;
    });
    closeFolderEditor();
    if (favoriteCommand) {
      setFavoriteCommand(null);
      setMobilePanel("history");
    }
  };
  const deleteFavoriteFolder = (folderId: string) => {
    const folder = favorites.folders.find((item) => item.id === folderId);
    if (!folder) return;
    const message = folder.commands.length
      ? `删除“${folder.name}”及其中 ${folder.commands.length} 条收藏命令？`
      : `删除文件夹“${folder.name}”？`;
    if (!window.confirm(message)) return;
    setFavorites((current) => deleteTerminalFavoriteFolder(current, folderId));
    closeFolderEditor();
  };
  const startDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const tool = toolRef.current?.getBoundingClientRect();
    const button = event.currentTarget.getBoundingClientRect();
    if (!tool) return;
    draggedRef.current = false;
    dragRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, left: button.left - tool.left, top: button.top - tool.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const tool = toolRef.current?.getBoundingClientRect();
    if (!drag || drag.pointerId !== event.pointerId || !tool) return;
    const deltaX = event.clientX - drag.clientX;
    const deltaY = event.clientY - drag.clientY;
    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) draggedRef.current = true;
    if (!draggedRef.current) return;
    setFabPosition({
      left: Math.max(8, Math.min(tool.width - 56, drag.left + deltaX)),
      top: Math.max(8, Math.min(tool.height - 56, drag.top + deltaY)),
    });
  };
  const endDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const toolWidth = toolRef.current?.clientWidth ?? 0;
  const toolHeight = toolRef.current?.clientHeight ?? 0;
  const desiredPopoverWidth = 280;
  const floatingStyle = fabPosition ? { ...fabPosition, right: "auto", bottom: "auto" } : undefined;
  const placement = fabPosition && toolWidth && toolHeight ? getTerminalPopoverPlacement(fabPosition, toolWidth, toolHeight, desiredPopoverWidth) : null;
  const popoverStyle = placement && fabPosition
    ? { width: placement.width, maxHeight: placement.maxHeight, left: placement.left - fabPosition.left, ...(placement.opensBelow ? { top: 56, bottom: "auto" } : { top: "auto", bottom: 56 }) }
    : undefined;

  return (
    <div ref={toolRef} className="terminal-tool">
      {error && <div className="terminal-tool-error" role="alert">{error}</div>}
      <div className="terminal-tool-viewport" style={isMobile ? { boxSizing: "border-box", paddingBottom: 28, position: "relative", isolation: "isolate" } : undefined}>
        <div ref={containerRef} className="terminal-tool-xterm" />
      </div>
      <div className="terminal-mobile-keyboard-dock" style={isMobile ? { marginTop: 0, position: "relative", zIndex: 1 } : undefined} role="group" aria-label="终端快捷键">
        {pasteOpen && (
          <div className="terminal-mobile-paste-editor">
            <textarea ref={pasteInputRef} value={pasteText} onChange={(event) => setPasteText(event.target.value)} placeholder="粘贴或输入命令" aria-label="粘贴或输入命令" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
            <div>
              <button type="button" onClick={() => setPasteOpen(false)}>收起</button>
              <button type="button" onClick={pasteToTerminal} disabled={!pasteText}>输入终端</button>
            </div>
          </div>
        )}
        <div className="terminal-mobile-keyboard-dock-grid" onPointerDownCapture={(event) => {
          event.preventDefault();
          terminalRef.current?.focus();
        }}>
          <button type="button" onClick={() => sendTerminalInput("\r")} title="回车" aria-label="回车">Enter</button>
          <button type="button" onClick={() => { setStickyModifier(null); setPasteOpen(true); }} title="粘贴或输入命令" aria-label="粘贴或输入命令">粘贴</button>
          <button type="button" onClick={() => sendTerminalInput("\x1b[A")} title="上箭头" aria-label="上箭头">↑</button>
          <button type="button" onClick={() => sendTerminalInput("\x1b")} title="取消" aria-label="取消">Esc</button>
          <button type="button" onClick={() => sendTerminalInput("\x1b[H")} title="行首" aria-label="行首">Home</button>
          <button type="button" onClick={() => sendTerminalInput("\x1b[F")} title="行尾" aria-label="行尾">End</button>
          <button type="button" onClick={() => sendTerminalInput("\t")} title="制表" aria-label="制表">Tab</button>
          <button type="button" onClick={() => sendTerminalInput("\x1b[D")} title="左箭头" aria-label="左箭头">←</button>
          <button type="button" onClick={() => sendTerminalInput("\x1b[B")} title="下箭头" aria-label="下箭头">↓</button>
          <button type="button" onClick={() => sendTerminalInput("\x1b[C")} title="右箭头" aria-label="右箭头">→</button>
          <button type="button" className={terminalModifier === "ctrl" ? "is-active" : ""} onClick={() => toggleStickyModifier("ctrl")} title="Ctrl 修饰键" aria-label="Ctrl 修饰键" aria-pressed={terminalModifier === "ctrl"}>Ctrl</button>
          <button type="button" className={terminalModifier === "alt" ? "is-active" : ""} onClick={() => toggleStickyModifier("alt")} title="Alt 修饰键" aria-label="Alt 修饰键" aria-pressed={terminalModifier === "alt"}>Alt</button>
        </div>
      </div>
      <div className="terminal-mobile-floating" style={floatingStyle}>
        {actionsOpen && (
          <div className="terminal-mobile-action-menu" role="menu" aria-label="终端操作">
            <button type="button" role="menuitem" onClick={() => selectMobilePanel("history")} title="最近命令" aria-label="最近命令"><HistoryIcon /></button>
            <button type="button" role="menuitem" onClick={() => selectMobilePanel("favorites")} title="命令收藏" aria-label="命令收藏"><StarIcon /></button>
          </div>
        )}
        {mobilePanel === "history" && (
          <div className="terminal-mobile-popover terminal-mobile-command-popover" style={popoverStyle} role="dialog" aria-label="最近命令">
          <div className="terminal-mobile-popover-heading">最近命令</div>
          <div className="terminal-mobile-command-list">
            {visibleHistory.length === 0 ? <div className="terminal-mobile-empty">暂无命令</div> : historyCommands.map((command) => (
              <div key={command} className="terminal-mobile-command-row">
                <button type="button" onClick={() => inputCommand(command)} title="输入命令" aria-label={`输入命令 ${command}`}>{command}</button>
                <button type="button" className={hasTerminalFavorite(favorites, command) ? "is-favorite" : ""} onClick={() => openFavoritePicker(command)} title={hasTerminalFavorite(favorites, command) ? "移动收藏" : "收藏到文件夹"} aria-label={hasTerminalFavorite(favorites, command) ? "移动收藏" : "收藏到文件夹"} aria-pressed={hasTerminalFavorite(favorites, command)}><StarIcon filled={hasTerminalFavorite(favorites, command)} /></button>
              </div>
            ))}
          </div>
          {visibleHistory.length > COMMANDS_PER_PAGE && <div className="terminal-mobile-pagination">
            <button type="button" onClick={() => setHistoryPage((page) => page - 1)} disabled={historyPage === 0} title="上一页" aria-label="上一页">←</button>
            <span>{historyPage + 1} / {historyPages}</span>
            <button type="button" onClick={() => setHistoryPage((page) => page + 1)} disabled={historyPage >= historyPages - 1} title="下一页" aria-label="下一页">→</button>
          </div>}
          </div>
        )}
        {mobilePanel === "favorites" && (
          <div className="terminal-mobile-popover terminal-mobile-command-popover" style={popoverStyle} role="dialog" aria-label="命令收藏">
          <div className="terminal-mobile-heading-row">
            {(favoriteCommand || favoriteFolder) && <button type="button" className="terminal-mobile-heading-button" onClick={() => {
              if (favoriteCommand) {
                setFavoriteCommand(null);
                setMobilePanel("history");
              } else {
                setFavoriteFolderId(null);
                setFavoritePage(0);
                setFolderDraftOpen(false);
              }
            }} title="返回" aria-label="返回">←</button>}
            <div className="terminal-mobile-popover-heading">{favoriteCommand ? "收藏到" : favoriteFolder?.name ?? "命令收藏"}</div>
            {!favoriteFolder && <button type="button" className="terminal-mobile-heading-button" onClick={() => { setFolderEditingId(null); setFolderDraft(""); setFolderDraftOpen(true); }} title="新建文件夹" aria-label="新建文件夹"><FolderAddIcon /></button>}
          </div>
          {folderDraftOpen && <div className="terminal-mobile-folder-editor">
            <form className="terminal-mobile-folder-form" onSubmit={(event) => { event.preventDefault(); saveFavoriteFolder(); }}>
              <input value={folderDraft} onChange={(event) => setFolderDraft(event.target.value)} placeholder="文件夹名称" aria-label="文件夹名称" autoFocus maxLength={40} />
              <button type="submit" disabled={!folderDraft.trim() || folderNameTaken} title={folderNameTaken ? "已有同名文件夹" : "保存文件夹"} aria-label="保存文件夹">✓</button>
              <button type="button" onClick={closeFolderEditor} title="取消" aria-label="取消">×</button>
            </form>
            {folderEditingId && <button type="button" className="terminal-mobile-folder-delete" onClick={() => deleteFavoriteFolder(folderEditingId)}><TrashIcon />删除文件夹</button>}
          </div>}
          {favoriteCommand ? (
            <>
              <div className="terminal-mobile-folder-list">
                {favorites.folders.length === 0 ? <div className="terminal-mobile-empty">新建文件夹后即可收藏</div> : favoriteFolders.map((folder) => (
                  <button key={folder.id} type="button" className="terminal-mobile-folder-row" onClick={() => saveFavoriteToFolder(folder.id)} title={`收藏到 ${folder.name}`} aria-label={`收藏到 ${folder.name}`}><FolderIcon size={17} /><span>{folder.name}</span><small>{folder.commands.length}</small></button>
                ))}
              </div>
              {favorites.folders.length > COMMANDS_PER_PAGE && <div className="terminal-mobile-pagination">
                <button type="button" onClick={() => setFolderPage((page) => page - 1)} disabled={folderPage === 0} title="上一页" aria-label="上一页">←</button>
                <span>{folderPage + 1} / {folderPages}</span>
                <button type="button" onClick={() => setFolderPage((page) => page + 1)} disabled={folderPage >= folderPages - 1} title="下一页" aria-label="下一页">→</button>
              </div>}
            </>
          ) : favoriteFolder ? (
            <>
              <div className="terminal-mobile-command-list">
                {favoriteCommands.length === 0 ? <div className="terminal-mobile-empty">暂无收藏命令</div> : favoriteCommands.map((command) => (
                  <div key={command} className="terminal-mobile-command-row">
                    <button type="button" onClick={() => inputCommand(command)} title="输入命令" aria-label={`输入命令 ${command}`}>{command}</button>
                    <button type="button" className="is-favorite" onClick={() => setFavorites((current) => removeTerminalFavorite(current, favoriteFolder.id, command))} title="取消收藏" aria-label="取消收藏"><StarIcon filled /></button>
                  </div>
                ))}
              </div>
              {favoriteFolder.commands.length > COMMANDS_PER_PAGE && <div className="terminal-mobile-pagination">
                <button type="button" onClick={() => setFavoritePage((page) => page - 1)} disabled={favoritePage === 0} title="上一页" aria-label="上一页">←</button>
                <span>{favoritePage + 1} / {favoritePages}</span>
                <button type="button" onClick={() => setFavoritePage((page) => page + 1)} disabled={favoritePage >= favoritePages - 1} title="下一页" aria-label="下一页">→</button>
              </div>}
            </>
          ) : (
            <>
              <div className="terminal-mobile-folder-list">
                {favorites.folders.length === 0 ? <div className="terminal-mobile-empty">暂无收藏文件夹</div> : favoriteFolders.map((folder) => (
                  <div key={folder.id} className="terminal-mobile-folder-item">
                    <button type="button" className="terminal-mobile-folder-row" onClick={() => { setFavoriteFolderId(folder.id); setFavoritePage(0); closeFolderEditor(); }} title={folder.name} aria-label={folder.name}><FolderIcon size={17} /><span>{folder.name}</span><small>{folder.commands.length}</small></button>
                    <button type="button" className="terminal-mobile-folder-edit" onClick={() => beginFolderRename(folder.id, folder.name)} title={`编辑 ${folder.name}`} aria-label={`编辑 ${folder.name}`}><PencilIcon /></button>
                  </div>
                ))}
              </div>
              {favorites.folders.length > COMMANDS_PER_PAGE && <div className="terminal-mobile-pagination">
                <button type="button" onClick={() => setFolderPage((page) => page - 1)} disabled={folderPage === 0} title="上一页" aria-label="上一页">←</button>
                <span>{folderPage + 1} / {folderPages}</span>
                <button type="button" onClick={() => setFolderPage((page) => page + 1)} disabled={folderPage >= folderPages - 1} title="下一页" aria-label="下一页">→</button>
              </div>}
            </>
          )}
          </div>
        )}
        <button type="button" className="terminal-mobile-fab" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onClick={() => {
          if (draggedRef.current) {
            draggedRef.current = false;
            return;
          }
          setActionsOpen((open) => !open);
          setMobilePanel(null);
          setPasteOpen(false);
          setStickyModifier(null);
        }} title="终端操作" aria-label="终端操作" aria-expanded={actionsOpen}>
          <ActionIcon open={actionsOpen} />
        </button>
      </div>
    </div>
  );
}

async function closeTerminalTab(tab: ToolPanelTab) {
  const response = await fetch(terminalUrl(tab.id), { method: "DELETE" });
  return response.ok;
}

export const terminalTool: RightPanelToolDefinition = {
  id: "terminal",
  label: "终端",
  description: "在项目目录中运行命令",
  Icon: TerminalIcon,
  Component: TerminalTool,
  allowMultipleTabs: true,
  preserveCwdOnWorkspaceChange: true,
  onCloseTab: closeTerminalTab,
};
