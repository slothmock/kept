import { describe, expect, it } from "vitest";

import { formatUsdc } from "../src/domain/money/usdc.js";

describe("USDC formatting", () => {
  it("formats atomic values", () => {
    expect(formatUsdc(12345678n)).toBe("12.34");
  });
});
