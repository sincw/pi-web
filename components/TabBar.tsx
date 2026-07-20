"use client";

import { useState } from "react";
import { getFileIcon } from "./FileIcons";

export interface Tab {
  id: string;
  label: string;
  filePath?: string;
  kind?: "explorer" | "review";
  workspaceCwd?: string | null;
  sourceSessionId?: string | null;
  diffOldContent?: string | null;
  // Frozen per-file diff: right side is the index (Staged) or worktree (Unstaged).
  diffNewContent?: string | null;
  // When set, the tab is a per-file diff and its label is annotated with the section.
  diffSection?: import("@/lib/git-diff-parse").DiffSection | null;
}

interface Props {
  tabs: Tab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
}

function ToolTabIcon({ kind }: { kind: "explorer" | "review" }) {
  if (kind === "explorer") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H10l2 2.5h6.5A1.5 1.5 0 0 1 20 7v12.5A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5z" />
        <path d="M9 10v5m0-5h6m-6 5h6m-3-5v8" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="5" r="2" /><circle cx="18" cy="7" r="2" /><circle cx="6" cy="19" r="2" />
      <path d="M8 5h3a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H8m8-10h-2" />
    </svg>
  );
}

export function TabBar({ tabs, activeTabId, onSelectTab, onCloseTab }: Props) {
  const [hoveredClose, setHoveredClose] = useState<string | null>(null);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        background: "var(--bg-panel)",
        overflowX: "auto",
        flexShrink: 0,
        height: 36,
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              height: 36,
              paddingLeft: 12,
              paddingRight: 6,
              borderRight: "1px solid var(--border)",
              background: isActive ? "var(--bg)" : "var(--bg-panel)",
              cursor: "pointer",
              fontSize: 12,
              color: isActive ? "var(--text)" : "var(--text-muted)",
              whiteSpace: "nowrap",
              maxWidth: 180,
              minWidth: 80,
              flexShrink: 0,
              userSelect: "none",
              transition: "background 0.1s, color 0.1s",
            }}
          >
            <span style={{ flexShrink: 0, opacity: isActive ? 1 : 0.7, display: "flex", alignItems: "center" }}>
              {tab.kind ? <ToolTabIcon kind={tab.kind} /> : getFileIcon(tab.label, 13)}
            </span>
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                flex: 1,
                fontWeight: isActive ? 500 : 400,
              }}
              title={tab.filePath ?? tab.label}
            >
              {tab.label}{tab.diffSection ? ` (${tab.diffSection})` : ""}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
              onMouseEnter={() => setHoveredClose(tab.id)}
              onMouseLeave={() => setHoveredClose(null)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 16, height: 16,
                background: hoveredClose === tab.id ? "var(--bg-hover)" : "transparent",
                border: "none",
                borderRadius: 3,
                color: hoveredClose === tab.id ? "var(--text)" : "var(--text-dim)",
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
                transition: "background 0.1s, color 0.1s",
              }}
              title="Close"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <line x1="2" y1="2" x2="8" y2="8" />
                <line x1="8" y1="2" x2="2" y2="8" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
