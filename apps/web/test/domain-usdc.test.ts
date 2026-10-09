import { describe, expect, it } from "vitest";

import { formatUsdc, formatUsdcUpToFour } from "../src/lib/usdc.js";

describe("USDC formatting", () => {
  it("formats atomic values", () => {
    expect(formatUsdc(12345678n)).toBe("12.34");
  });
});

describe("adaptive USDC display precision", () => {
  it("keeps two decimal places for whole cents", () => {
    expect(formatUsdcUpToFour(998_000_000n)).toBe("998.00");
    expect(formatUsdcUpToFour(998_010_000n)).toBe("998.01");
  });

  it("shows third or fourth decimals only when nonzero", () => {
    expect(formatUsdcUpToFour(998_001_000n)).toBe("998.001");
    expect(formatUsdcUpToFour(998_000_100n)).toBe("998.0001");
    expect(formatUsdcUpToFour(998_010_200n)).toBe("998.0102");
  });

  it("truncates rather than rounding and handles negatives", () => {
    expect(formatUsdcUpToFour(998_009_999n)).toBe("998.0099");
    expect(formatUsdcUpToFour(-1_987_654n)).toBe("-1.9876");
    expect(formatUsdcUpToFour(99n)).toBe("0.00");
  });
});
