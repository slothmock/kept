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
  const portions = goals.map(([bucket, shares]) => ({
    bucket: bucket as AllocationBucketKey,
    shares,
    remove: shares * toRemove / totalGoals,
    remainder: shares * toRemove % totalGoals,
  }));
  let left = toRemove - portions.reduce((sum, p) => sum + p.remove, 0n);
  const ranked = [...portions].sort((a,b) => a.remainder === b.remainder
    ? a.bucket.localeCompare(b.bucket)
    : a.remainder > b.remainder ? -1 : 1);
  for (const portion of ranked) {
    if (left === 0n) break;
    if (portion.remove < portion.shares) {portion.remove += 1n; left -= 1n;}
  }
  if (left !== 0n) throw new Error("Could not distribute integer share remainder");
  for (const portion of portions) if (portion.remove > 0n) {
    legs.push({bucket: portion.bucket, deltaShares: -portion.remove});
  }
  if (legs.reduce((sum, leg) => sum + leg.deltaShares, 0n) !== liveShares - current) {
    throw new Error("Reconciliation does not conserve shares");
  }
  return {kind: "RECONCILIATION_DEBIT", legs};
}
