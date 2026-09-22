import { describe, expect, it } from "vitest";

import { formatUsdcPrecise } from "../src/features/savings/format.js";

describe("precise USDC formatting", () => {
  it("shows sub-cent fee and net amounts without truncating them", () => {
    expect(formatUsdcPrecise(5_000n)).toBe("0.005");
    expect(formatUsdcPrecise(995_000n)).toBe("0.995");
  });

  it("retains up to six USDC decimal places and at least two", () => {
    expect(formatUsdcPrecise(1n)).toBe("0.000001");
    expect(formatUsdcPrecise(100_000_000n)).toBe("100.00");
  });
});