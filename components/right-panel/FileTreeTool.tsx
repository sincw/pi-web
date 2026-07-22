"use client";

import { WorkspaceFileTree } from "../WorkspaceFileTree";
import type { RightPanelToolDefinition, RightPanelToolProps } from "./types";

function FileTreeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H10l2 2.5h6.5A1.5 1.5 0 0 1 20 7v12.5A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5z" />
      <path d="M9 10v5m0-5h6m-6 5h6m-3-5v8" />
    </svg>
  );
}

function FileTreeTool({ cwd, explorerRefreshKey, fileTreeRevealRequest, onOpenFile, onAtMention }: RightPanelToolProps) {
  return (
    <WorkspaceFileTree
      cwd={cwd}
      onOpenFile={onOpenFile}
      refreshKey={explorerRefreshKey}
      revealRequest={fileTreeRevealRequest}
      onAtMention={onAtMention}
      allowMutations
    />
  );
}

export const fileTreeTool: RightPanelToolDefinition = {
  id: "file-tree",
  label: "文件树",
  description: "浏览和管理项目文件",
  Icon: FileTreeIcon,
  Component: FileTreeTool,
};
