import { describe, expect, it } from "vitest";
import type { TransactionDto } from "../src/api/kept-api";
import { transactionsForGoal } from "../src/features/goals/recent-activity";

function transaction(id: string, goalId: string | null): TransactionDto {
  return {
    id,
    goalId,
    type: "savings_deposit",
    status: "completed",
    amountAtomic: "1000000",
    asset: "USDC",
    description: "Savings activity",
    chainId: null,
    transactionHash: null,
    externalReference: null,
    createdAt: "2026-10-09T20:00:00.000Z",
  };
}

describe("goal recent activity", () => {
  it("includes only transactions attributed to the selected goal", () => {
    const transactions = [
      transaction("other", "goal-b"),
      transaction("wallet", null),
      transaction("first", "goal-a"),
      transaction("second", "goal-a"),
    ];
    expect(transactionsForGoal(transactions, "goal-a").map((item) => item.id))
      .toEqual(["first", "second"]);
  });

  it("shows no transactions when the selected goal has none", () => {
    expect(transactionsForGoal([transaction("wallet", null)], "goal-a"))
      .toEqual([]);
  });
});
