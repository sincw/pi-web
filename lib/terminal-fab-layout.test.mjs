import assert from "node:assert/strict";
import test from "node:test";
import { getTerminalPopoverPlacement } from "./terminal-fab-layout.ts";

test("terminal popovers stay inside the terminal around a dragged FAB", () => {
  for (const fab of [{ left: 8, top: 8 }, { left: 336, top: 8 }, { left: 8, top: 646 }, { left: 336, top: 646 }]) {
    const placement = getTerminalPopoverPlacement(fab, 390, 700, 280);
    assert.ok(placement.left >= 8);
    assert.ok(placement.left + placement.width <= 382);
    assert.ok(placement.maxHeight <= 360);
    assert.ok(placement.maxHeight <= (placement.opensBelow ? 700 - fab.top - 56 : fab.top - 8));
  }
});
