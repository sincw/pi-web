export function getTerminalVisibleHeight(layoutHeight: number, viewportHeight: number, viewportOffsetTop: number, terminalTop: number) {
  if (layoutHeight - viewportHeight <= 120) return null;
  return Math.max(0, Math.floor(viewportHeight - terminalTop + viewportOffsetTop));
}
