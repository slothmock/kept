/**
 * Internal vault-share accounting. This module does not read the chain or
 * declare previously held shares to be newly deposited.
 */
export type AllocationBucketKey = "UNASSIGNED" | `GOAL:${string}`;
export type AllocationEventKind =
  | "OPENING"
  | "TRANSFER"
  | "VAULT_CREDIT"
  | "VAULT_DEBIT"
  | "RECONCILIATION_CREDIT"
  | "RECONCILIATION_DEBIT";

export interface AllocationLeg {
  readonly bucket: AllocationBucketKey;
  readonly deltaShares: bigint;
}

/** Immutable attribution carried between buckets; never inferred from destination. */
export interface AllocationProvenance {
  readonly originEventId: string;
  readonly originKind: "OPENING" | "EXTERNAL_DEPOSIT" | "LEGACY" | "UNKNOWN";
  readonly firstAllocatedGoalId: string | null;
  readonly lastQualifiedEpochEnd: Date | null;
}

export function goalBucket(goalId: string): AllocationBucketKey {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(goalId)) {
    throw new Error("Invalid goal id");
  }
  return `GOAL:${goalId}`;
}

export function assertLedgerEvent(
  kind: AllocationEventKind,
  legs: readonly AllocationLeg[],
): void {
  if (legs.length === 0 || legs.some(leg => leg.deltaShares === 0n)) {
    throw new Error("Ledger event requires nonzero legs");
  }
  const sum = legs.reduce((value, leg) => value + leg.deltaShares, 0n);
  if (kind === "TRANSFER" && (legs.length !== 2 || sum !== 0n ||
    legs[0]?.deltaShares !== -legs[1]!.deltaShares ||
    legs[0]?.bucket === legs[1]?.bucket)) {
    throw new Error("Internal transfer must have two opposite legs between distinct buckets");
  }
  if (kind !== "TRANSFER" && kind !== "OPENING" && legs.length !== 1) {
    throw new Error("Vault boundary events require one leg");
  }
  if ((kind === "VAULT_CREDIT" || kind === "RECONCILIATION_CREDIT") &&
    (legs.length !== 1 || legs[0]?.bucket !== "UNASSIGNED" || sum <= 0n)) {
    throw new Error("Vault credits must increase unassigned shares");
  }
  if ((kind === "VAULT_DEBIT" || kind === "RECONCILIATION_DEBIT") && sum >= 0n) {
    throw new Error("Vault debits must reduce shares");
  }
  if (kind === "OPENING" && legs.some(leg => leg.deltaShares < 0n)) {
    throw new Error("Opening bucket positions cannot be negative");
  }
}

export function assertNonnegativeBalances(
  opening: ReadonlyMap<AllocationBucketKey, bigint>,
  legs: readonly AllocationLeg[],
): void {
  const next = new Map(opening);
  for (const leg of legs) {
    const value = (next.get(leg.bucket) ?? 0n) + leg.deltaShares;
    if (value < 0n) throw new Error("Insufficient shares in source bucket");
    next.set(leg.bucket, value);
  }
}
