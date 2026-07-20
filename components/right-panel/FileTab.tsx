"use client";

import { FileViewer } from "../FileViewer";
import { getFileName } from "@/lib/file-paths";
import type { FilePanelTab } from "./types";

interface Props {
  tab: FilePanelTab;
  onOpenFile: (filePath: string, fileName: string, sourceSessionId?: string | null) => void;
}

export function FileTab({ tab, onOpenFile }: Props) {
  return (
    <FileViewer
      filePath={tab.filePath}
      cwd={tab.workspaceCwd}
      sourceSessionId={tab.sourceSessionId}
      diffOldContent={tab.diffOldContent ?? null}
      diffNewContent={tab.diffNewContent ?? null}
      onOpenFile={(filePath) => onOpenFile(filePath, getFileName(filePath), tab.sourceSessionId)}
    />
  );
}
