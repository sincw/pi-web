import { fileTreeTool } from "./FileTreeTool";
import { reviewTool } from "./ReviewTool";
import type { RightPanelToolDefinition } from "./types";

// The launcher, creation menu, and tool-tab icons are all derived from this registry.
export const rightPanelTools: RightPanelToolDefinition[] = [
  fileTreeTool,
  reviewTool,
];

export function getRightPanelTool(id: string): RightPanelToolDefinition | undefined {
  return rightPanelTools.find((tool) => tool.id === id);
}
