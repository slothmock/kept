import { describe, expect, it } from "vitest";

import { COMMITMENT_OPTIONS } from "../src/features/commitments/options.js";

describe("commitment options", () => {
  it("offers weekly savings without advertising an unconfigured reward", () => {
    expect(COMMITMENT_OPTIONS.WEEKLY_SAVINGS_V1.available).toBe(true);
    expect(COMMITMENT_OPTIONS.WEEKLY_SAVINGS_V1).not.toHaveProperty("weeklyRateBps");
    expect(COMMITMENT_OPTIONS.WEEKLY_SAVINGS_V1).not.toHaveProperty("maxRewardAtomic");
  });

  it("keeps activity commitments unavailable until verification is connected", () => {
    expect(COMMITMENT_OPTIONS.ACTIVITY_COUNT_V1.available).toBe(false);
    expect(COMMITMENT_OPTIONS.ACTIVITY_COUNT_V1.availabilityLabel).toBe("Coming soon");
  });
});
