import type { TransactionDto } from "@/api/kept-api";

/** A goal's activity must not include general wallet or other-goal transactions. */
export function transactionsForGoal(
  transactions: readonly TransactionDto[],
  goalId: string,
): readonly TransactionDto[] {
  return transactions.filter((transaction) => transaction.goalId === goalId);
}
