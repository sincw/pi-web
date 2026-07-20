"use client";

import { FilesChangedSidebar } from "../FilesChangedSidebar";
import type { RightPanelToolDefinition, RightPanelToolProps } from "./types";

function ReviewIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="5" r="2" /><circle cx="18" cy="7" r="2" /><circle cx="6" cy="19" r="2" />
      <path d="M8 5h3a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H8m8-10h-2" />
    </svg>
  );
}

function ReviewTool({ cwd, onOpenFile, onOpenDiffFile }: RightPanelToolProps) {
  return (
    <FilesChangedSidebar
      cwd={cwd}
      onOpenFile={onOpenFile}
      onOpenDiffFile={onOpenDiffFile}
    />
  );
}

export const reviewTool: RightPanelToolDefinition = {
  id: "review",
  label: "审查",
  description: "查看代码变更和提交历史",
  Icon: ReviewIcon,
  Component: ReviewTool,
};
