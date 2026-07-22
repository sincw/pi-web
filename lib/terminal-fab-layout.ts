export function getTerminalPopoverPlacement(
  fab: { left: number; top: number },
  toolWidth: number,
  toolHeight: number,
  desiredWidth: number,
) {
  const width = Math.max(0, Math.min(desiredWidth, toolWidth - 16));
  const opensBelow = toolHeight - fab.top - 56 > fab.top - 8;
  const maxHeight = Math.min(360, Math.max(0, opensBelow ? toolHeight - fab.top - 56 : fab.top - 8));
  const left = Math.max(8, Math.min(toolWidth - width - 8, fab.left));
  return { width, maxHeight, left, opensBelow };
}
