import { describe, expect, it } from "vitest";

import { parseUsdcDepositAmount } from "./vault-deposit-input.js";

describe("USDC deposit input", () => {
  it("converts a whole and fractional USDC amount into six-decimal base units", () => {
    expect(parseUsdcDepositAmount("12.3456")).toEqual({ assets: 12_345_600n });
  });

  it("rejects an empty, zero, negative, or over-precise amount", () => {
    expect(parseUsdcDepositAmount("")).toEqual({ error: "Enter an amount greater than 0." });
    expect(parseUsdcDepositAmount("0")).toEqual({ error: "Enter an amount greater than 0." });
    expect(parseUsdcDepositAmount("-1")).toEqual({ error: "Enter an amount greater than 0." });
    expect(parseUsdcDepositAmount("1.1234567")).toEqual({ error: "Enter up to 6 decimal places." });
  });
});
