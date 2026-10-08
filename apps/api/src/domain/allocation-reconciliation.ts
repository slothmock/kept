import type { AllocationLeg, AllocationBucketKey } from "./allocation-ledger.js";

/** Deterministic, integer-exact vault reconciliation; does not infer deposits. */
export function planVaultReconciliation(
  balances: Readonly<Record<string, bigint>>,
  liveShares: bigint,
): { kind: "RECONCILIATION_CREDIT" | "RECONCILIATION_DEBIT"; legs: readonly AllocationLeg[] } | null {
  if (liveShares < 0n) throw new Error("Negative vault balance");
  const rows = Object.entries(balances).sort(([a], [b]) => a.localeCompare(b));
  if (rows.some(([key, value]) => (key !== "UNASSIGNED" && !/^GOAL:[0-9a-f-]{36}$/i.test(key)) || value < 0n)) {
    throw new Error("Invalid ledger balance");
  }
  const current = rows.reduce((sum, [, shares]) => sum + shares, 0n);
  if (liveShares === current) return null;
  if (liveShares > current) {
    return {kind: "RECONCILIATION_CREDIT", legs: [{bucket: "UNASSIGNED", deltaShares: liveShares - current}]};
  }
  let toRemove = current - liveShares;
  const legs: AllocationLeg[] = [];
  const unassigned = balances.UNASSIGNED ?? 0n;
  const fromUnassigned = toRemove < unassigned ? toRemove : unassigned;
  if (fromUnassigned > 0n) {
    legs.push({bucket: "UNASSIGNED", deltaShares: -fromUnassigned});
    toRemove -= fromUnassigned;
  }
  if (toRemove === 0n) return {kind: "RECONCILIATION_DEBIT", legs};
  const goals = rows.filter(([key, shares]) => key.startsWith("GOAL:") && shares > 0n);
  const totalGoals = goals.reduce((sum, [, shares]) => sum + shares, 0n);
  if (toRemove > totalGoals || totalGoals === 0n) throw new Error("Withdrawal exceeds goal holdings");
  // Match the existing legacy reconciliation rule: floor survivor shares,
  // then assign leftover survivor shares in stable goal-id order.
  const survivors = totalGoals - toRemove;
  const portions = goals.map(([bucket, shares]) => ({
    bucket: bucket as AllocationBucketKey,
    shares,
    target: shares * survivors / totalGoals,
  }));
  let remainder = survivors - portions.reduce((sum, p) => sum + p.target, 0n);
  for (const portion of portions) {
    if (remainder === 0n) break;
    if (portion.target < portion.shares) {
      portion.target += 1n;
      remainder -= 1n;
    }
  }
  if (remainder !== 0n) throw new Error("Could not distribute integer share remainder");
  for (const portion of portions) {
    const removed = portion.shares - portion.target;
    if (removed > 0n) legs.push({bucket: portion.bucket, deltaShares: -removed});
  }
  if (legs.reduce((sum, leg) => sum + leg.deltaShares, 0n) !== liveShares - current) {
    throw new Error("Reconciliation does not conserve shares");
  }
  return {kind: "RECONCILIATION_DEBIT", legs};
}
