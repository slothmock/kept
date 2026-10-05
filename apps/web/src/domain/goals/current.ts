export function currentGoalItem<T extends { savingsGoalId: string; state: string }>(goalId: string, items: readonly T[]): T | undefined {
  const matches = items.filter((item) => item.savingsGoalId === goalId);
  return matches.find((item) => item.state === "ACTIVE") ?? matches.find((item) => item.state === "DRAFT") ?? matches[0];
}
