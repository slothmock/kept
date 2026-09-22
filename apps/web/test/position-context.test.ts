import { describe, expect, it } from "vitest";

import {
  currentPositionState,
  type BoundPositionState,
} from "../src/features/dashboard/position-context.js";

const firstAccount = "0x1111111111111111111111111111111111111111";
const secondAccount = "0x2222222222222222222222222222222222222222";

const readyPosition: BoundPositionState = {
  kind: "ready",
  account: firstAccount,
  chainId: 143,
  position: {
    usdcBalance: 100n,
    allowance: 90n,
    shares: 80n,
    assets: 85n,
    withdrawableAssets: 70n,
  },
};

describe("position context", () => {
  it("makes a ready position unavailable after the selected account changes", () => {
    expect(currentPositionState(readyPosition, {
      account: secondAccount,
      chainId: 143,
    })).toEqual({ kind: "unavailable" });
  });

  it("makes a ready position unavailable when the live wallet chain changes", () => {
    expect(currentPositionState(readyPosition, {
      account: firstAccount,
      chainId: 1,
    })).toEqual({ kind: "unavailable" });
  });

  it("keeps a ready position only for its normalized account and live chain", () => {
    expect(currentPositionState(readyPosition, {
      account: firstAccount.toUpperCase() as typeof firstAccount,
      chainId: 143,
    })).toBe(readyPosition);
  });

  it("fails closed while the live wallet chain is unavailable", () => {
    expect(currentPositionState(readyPosition, {
      account: firstAccount,
      chainId: null,
    })).toEqual({ kind: "unavailable" });
  });
});
