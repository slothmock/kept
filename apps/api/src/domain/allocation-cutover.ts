import type { AllocationBucketKey } from "./allocation-ledger.js";

export function assertAllocationCutoverParity(input: {
  readonly hasOpening: boolean;
  readonly liveVaultShares: bigint;
  readonly legacyGoalShares: Readonly<Record<string, bigint>>;
  readonly ledgerBalances: Readonly<Record<string, bigint>>;
}): void {
  if (!input.hasOpening) throw new Error("Allocation ledger has no verified opening event");
  if (input.liveVaultShares < 0n) throw new Error("Negative live vault shares");
  const expected = new Map<AllocationBucketKey, bigint>();
  let allocated = 0n;
  for (const [goalId, shares] of Object.entries(input.legacyGoalShares)) {
    if (shares < 0n) throw new Error("Negative legacy goal allocation");
    if (shares === 0n) continue;
    const key = `GOAL:${goalId}` as AllocationBucketKey;
    expected.set(key, shares);
    allocated += shares;
  }
  if (allocated > input.liveVaultShares) throw new Error("Legacy goal allocations exceed vault shares");
  expected.set("UNASSIGNED", input.liveVaultShares - allocated);
  let ledgerTotal = 0n;
  for (const [key, shares] of Object.entries(input.ledgerBalances)) {
    if (shares < 0n) throw new Error("Negative ledger bucket balance");
    if (key !== "UNASSIGNED" && !key.startsWith("GOAL:")) throw new Error("Unexpected ledger bucket");
    ledgerTotal += shares;
    if (shares !== (expected.get(key as AllocationBucketKey) ?? 0n)) {
      throw new Error(`Allocation cutover bucket mismatch: ${key}`);
    }
  }
  for (const [key, shares] of expected) {
    if (shares !== (input.ledgerBalances[key] ?? 0n)) {
      throw new Error(`Allocation cutover bucket mismatch: ${key}`);
    }
  }
  if (ledgerTotal !== input.liveVaultShares) throw new Error("Ledger shares differ from live vault shares");
}
