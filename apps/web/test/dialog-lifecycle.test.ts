import { describe, expect, it, vi } from "vitest";

import { updateDialogOpenState } from "../src/features/dashboard/dialog-lifecycle.js";

describe("dialog lifecycle", () => {
  it("clears transient feedback when a dialog closes", () => {
    const setOpen = vi.fn();
    const onDismiss = vi.fn();

    updateDialogOpenState(false, setOpen, onDismiss);

    expect(setOpen).toHaveBeenCalledWith(false);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("does not clear feedback when a dialog opens", () => {
    const setOpen = vi.fn();
    const onDismiss = vi.fn();

    updateDialogOpenState(true, setOpen, onDismiss);

    expect(setOpen).toHaveBeenCalledWith(true);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
