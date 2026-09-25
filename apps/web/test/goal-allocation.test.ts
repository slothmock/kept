import { describe, expect, it, vi } from "vitest";

import {
  allocationInputError,
  deallocationInputError,
  goalFundingPercent,
  previewAllocationShares,
  readGoalFunding,
} from "../src/features/goals/funding.js";
import {
  clearPendingGoalAllocation,
  loadPendingGoalAllocation,
  savePendingGoalAllocation,
} from "../src/features/goals/pending-allocation.js";

const vault = "0x0000000000000000000000000000000000000001" as const;
const allocation = {
  goalId: "goal-1",
  allocatedSharesAtomic: "50000000000000",
  totalVaultSharesAtomic: "500000000000000",
  totalAllocatedSharesAtomic: "100000000000000",
  unallocatedSharesAtomic: "400000000000000",
};

describe("goal allocation funding", () => {
  it("converts goal and aggregate shares through the vault without assuming parity", async () => {
    const readContract = vi.fn(async (request: unknown) => {
      const shares = (request as { args: readonly [bigint] }).args[0];
      return shares * 2n / 1_000_000n;
    });

    const funding = await readGoalFunding({
      allocations: [allocation, { ...allocation, goalId: "goal-2", allocatedSharesAtomic: "50000000000000" }],
      publicClient: { readContract },
      vault,
    });

    expect(funding.totalAllocatedAssets).toBe(200_000_000n);
    expect(funding.unallocatedAssets).toBe(800_000_000n);
    expect(funding.byGoal.get("goal-1")).toEqual({
      allocatedShares: 50_000_000_000_000n,
      allocatedAssets: 100_000_000n,
    });
    expect(readContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: "convertToAssets" }));
  });

  it("calculates zero, partial, and over-target progress without hiding the balance", () => {
    expect(goalFundingPercent(0n, 100_000_000n)).toEqual({ labelPercent: 0, visualPercent: 0 });
    expect(goalFundingPercent(50_000_000n, 100_000_000n)).toEqual({ labelPercent: 50, visualPercent: 50 });
    expect(goalFundingPercent(125_000_000n, 100_000_000n)).toEqual({ labelPercent: 125, visualPercent: 100 });
  });

  it("rejects zero amounts and share requirements above the unallocated balance", () => {
    expect(allocationInputError(0n, 1n, 100n)).toBe("Enter an amount greater than zero.");
    expect(allocationInputError(10_000_000n, 101n, 100n)).toBe(
      "Enter an amount no greater than your unallocated savings.",
    );
    expect(allocationInputError(10_000_000n, 100n, 100n)).toBeNull();
  });

  it("previews the shares required for a requested asset amount", async () => {
    const readContract = vi.fn(async () => 10_050_000_000_000n);
    await expect(previewAllocationShares({
      assets: 10_000_000n,
      publicClient: { readContract },
      vault,
    })).resolves.toBe(10_050_000_000_000n);
    expect(readContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName: "previewWithdraw",
      args: [10_000_000n],
    }));
  });

  it("persists an ambiguous allocation attempt for safe retry after reload", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const attempt = {
      account: "0x0000000000000000000000000000000000000002",
      goalId: "goal-1",
      assetsAtomic: "25000000",
      sharesAtomic: "100000000000000",
      idempotencyKey: "allocation-key",
    };

    expect(savePendingGoalAllocation(storage, attempt)).toBe(true);
    const otherAttempt = {
      ...attempt,
      account: "0x0000000000000000000000000000000000000003",
      goalId: "goal-2",
    };
    expect(savePendingGoalAllocation(storage, otherAttempt)).toBe(true);
    expect(loadPendingGoalAllocation(storage, attempt.account)).toEqual(attempt);
    expect(loadPendingGoalAllocation(storage, otherAttempt.account)).toEqual(otherAttempt);
    clearPendingGoalAllocation(storage, attempt.account);
    expect(loadPendingGoalAllocation(storage, attempt.account)).toBeNull();
    expect(loadPendingGoalAllocation(storage, otherAttempt.account)).toEqual(otherAttempt);
  });

  it("fails closed when an allocation retry record cannot be persisted", () => {
    const storage = {
      getItem: () => null,
      setItem: () => { throw new Error("storage blocked"); },
      removeItem: () => undefined,
    };
    expect(savePendingGoalAllocation(storage, {
      account: "0x0000000000000000000000000000000000000002",
      goalId: "goal-1",
      assetsAtomic: "25000000",
      sharesAtomic: "100000000000000",
      idempotencyKey: "allocation-key",
    })).toBe(false);
  });
});

describe("goal allocation validation", () => {
  it("allows removing shares up to the amount assigned to the goal", () => {
    expect(
      deallocationInputError(
        50_000_000n,
        50n,
        100n,
      ),
    ).toBeNull();
  });

  it("allows removing the entire goal allocation", () => {
    expect(
      deallocationInputError(
        100_000_000n,
        100n,
        100n,
      ),
    ).toBeNull();
  });

  it("rejects removing more shares than are assigned to the goal", () => {
    expect(
      deallocationInputError(
        101_000_000n,
        101n,
        100n,
      ),
    ).toBe(
      "Enter an amount no greater than the savings assigned to this goal.",
    );
  });

  it("rejects a zero deallocation amount", () => {
    expect(
      deallocationInputError(
        0n,
        0n,
        100n,
      ),
    ).not.toBeNull();
  });
});
