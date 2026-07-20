import type { ComponentType } from "react";
import type { DiffSection } from "@/lib/git-diff-parse";

export interface OpenDiffFileArgs {
  filePath: string;
  fileName: string;
  oldContent: string;
  newContent: string | null;
  section: DiffSection;
}

export interface RightPanelToolProps {
  cwd: string;
  sourceSessionId: string | null;
  explorerRefreshKey: number;
  onOpenFile: (filePath: string, fileName: string) => void;
  onOpenDiffFile: (args: OpenDiffFileArgs) => void;
  onAtMention: (relativePath: string, isDir: boolean) => void;
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
  diffOldContent?: string | null;
  diffNewContent?: string | null;
  diffSection?: DiffSection | null;
}

export type RightPanelTab = ToolPanelTab | FilePanelTab;

export interface RightPanelHandle {
  openFile: (filePath: string, fileName: string, sourceSessionId?: string | null) => void;
}
