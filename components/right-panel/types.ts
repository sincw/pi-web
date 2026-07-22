import type { ComponentType } from "react";
export interface RightPanelToolProps {
  cwd: string;
  sourceSessionId: string | null;
  explorerRefreshKey: number;
  fileTreeRevealRequest: { path: string; id: number } | null;
  onOpenFile: (filePath: string, fileName: string) => void;
  onAtMention: (relativePath: string, isDir: boolean) => void;
  onRevealInFileTree: (filePath: string) => void;
}

export interface RightPanelToolDefinition {
  id: string;
  label: string;
  description: string;
  Icon: ComponentType<{ size?: number }>;
  Component: ComponentType<RightPanelToolProps>;
}

export interface ToolPanelTab {
  id: string;
  type: "tool";
  toolId: string;
  cwd: string;
}

export interface FilePanelTab {
  id: string;
  type: "file";
  label: string;
  filePath: string;
  workspaceCwd: string;
  sourceSessionId?: string | null;
}

export type RightPanelTab = ToolPanelTab | FilePanelTab;

export interface RightPanelHandle {
  openFile: (filePath: string, fileName: string, sourceSessionId?: string | null) => void;
}
