import { describe, expect, it } from "vitest";

import {
  MINIMUM_USDC_DEPOSIT_ASSETS,
  minimumUsdcDepositError,
} from "../src/features/savings/vault/deposit-input.js";

describe("minimum USDC deposit", () => {
  it("rejects amounts below 10 USDC", () => {
    expect(MINIMUM_USDC_DEPOSIT_ASSETS).toBe(10_000_000n);
    expect(minimumUsdcDepositError(9_999_999n)).toBe("Enter at least 10 USDC.");
  });

  it("accepts 10 USDC and larger amounts", () => {
    expect(minimumUsdcDepositError(10_000_000n)).toBeNull();
    expect(minimumUsdcDepositError(25_000_000n)).toBeNull();
  });
});
