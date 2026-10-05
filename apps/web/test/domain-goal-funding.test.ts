import { describe, expect, it } from "vitest";

import {
  allocationInputError,
  deallocationInputError,
  goalFundingPercent,
  parseGoalFundingTotals,
} from "../src/domain/goals/funding.js";

describe("goal funding domain rules", () => {
  it("parses consistent non-negative totals", () => {
    expect(
      parseGoalFundingTotals({
        totalVaultSharesAtomic: "100",
        totalAllocatedSharesAtomic: "70",
        unallocatedSharesAtomic: "30",
      }),
    ).toEqual({
      totalVaultShares: 100n,
      totalAllocatedShares: 70n,
      unallocatedShares: 30n,
    });
  });

  it("rejects malformed or inconsistent totals", () => {
    expect(() =>
      parseGoalFundingTotals({
        totalVaultSharesAtomic: "-1",
        totalAllocatedSharesAtomic: "0",
        unallocatedSharesAtomic: "0",
      }),
    ).toThrow(
      "totalVaultSharesAtomic is not a non-negative integer",
    );

    expect(() =>
      parseGoalFundingTotals({
        totalVaultSharesAtomic: "100",
        totalAllocatedSharesAtomic: "80",
        unallocatedSharesAtomic: "30",
      }),
    ).toThrow(
      "Goal allocation totals do not match the current savings balance",
    );
  });

  it("validates allocation and deallocation limits", () => {
    expect(
      allocationInputError(0n, 0n, 100n),
    ).toBe("Enter an amount greater than zero.");

    expect(
      allocationInputError(1n, 0n, 100n),
    ).toBe("That amount is too small to add to this goal.");

    expect(
      allocationInputError(10n, 101n, 100n),
    ).toBe(
      "Enter an amount no greater than your unallocated savings.",
    );

    expect(
      deallocationInputError(1n, 101n, 100n),
    ).toBe(
      "Enter an amount no greater than the savings assigned to this goal.",
    );
  });

  it("keeps the displayed percentage unbounded while clamping the visual percentage", () => {
    expect(
      goalFundingPercent(
        150_000_000n,
        100_000_000n,
      ),
    ).toEqual({
      labelPercent: 150,
      visualPercent: 100,
    });
  });
});
