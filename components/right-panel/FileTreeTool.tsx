"use client";

import { WorkspaceFileTree } from "../WorkspaceFileTree";
import { FolderTree } from "lucide-react";
import type { RightPanelToolDefinition, RightPanelToolProps } from "./types";

function FileTreeIcon({ size = 18 }: { size?: number }) {
  return <FolderTree size={size} strokeWidth={1.9} aria-hidden="true" />;
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
