import { describe, expect, it } from "vitest";

import {
  currentDepositQuote,
  type DepositQuoteState,
} from "../src/features/savings/deposit-quote.js";

const readyQuote: DepositQuoteState = {
  kind: "ready",
  quote: {
    assets: 100_000_000n,
    grossAssets: 100_200_401n,
    depositFeeAssets: 200_401n,
    depositFeeBps: 50n,
    expectedNetAssets: 100_000_000n,
    performanceFeeBps: 1_000n,
    bpsDenominator: 10_000n,
  },
};

describe("deposit quote state", () => {
  it("keeps a quote only while it matches the current parsed amount", () => {
    expect(currentDepositQuote(readyQuote, "100")).toBe(readyQuote);
    expect(currentDepositQuote(readyQuote, "100.00")).toBe(readyQuote);
  });

  it("shows a loading state when the amount changes before a replacement quote loads", () => {
    expect(currentDepositQuote(readyQuote, "101")).toEqual({ kind: "loading" });
  });

  it("does not expose a quote for invalid input", () => {
    expect(currentDepositQuote(readyQuote, "not an amount")).toEqual({ kind: "idle" });
  });

  it("does not request or expose a quote below the minimum deposit", () => {
    expect(currentDepositQuote(readyQuote, "9.999999")).toEqual({ kind: "idle" });
  });
});
