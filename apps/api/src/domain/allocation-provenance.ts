import type { AllocationBucketKey } from "./allocation-ledger.js";

/**
 * A share lot retains its funding origin and complete goal visitation history.
 * Moving it through UNASSIGNED cannot restore first-allocation eligibility.
 */
export interface ProvenanceLot {
  readonly bucket: AllocationBucketKey;
  readonly shares: bigint;
  readonly originEventId: string;
  readonly originKind: "OPENING" | "EXTERNAL_DEPOSIT" | "LEGACY" | "UNKNOWN";
  readonly visitedGoals: readonly AllocationBucketKey[];
}

export interface ProvenanceMovement {
  /** All positions after the move; shares are conserved. */
  readonly lots: readonly ProvenanceLot[];
  /** The transferred lots with provenance from before the move. */
  readonly moved: readonly ProvenanceLot[];
}

export function moveProvenanceLots(
  lots: readonly ProvenanceLot[],
  from: AllocationBucketKey,
  to: AllocationBucketKey,
  shares: bigint,
): ProvenanceMovement {
  if (shares <= 0n || from === to) throw new Error("Invalid provenance transfer");
  if (lots.some(lot => lot.shares <= 0n)) throw new Error("Invalid provenance lot");
  let remaining = shares;
  const next: ProvenanceLot[] = [];
  const moved: ProvenanceLot[] = [];
  for (const lot of lots) {
    if (lot.bucket !== from || remaining === 0n) {
      next.push(lot);
      continue;
    }
    const taken = lot.shares < remaining ? lot.shares : remaining;
    remaining -= taken;
    if (lot.shares > taken) next.push({...lot, shares: lot.shares - taken});
    // Preserve historic eligibility independently of where the shares sit.
    moved.push({...lot, shares: taken});
    next.push({
      ...lot,
      bucket: to,
      shares: taken,
      visitedGoals: to === "UNASSIGNED" || lot.visitedGoals.includes(to)
        ? lot.visitedGoals
        : [...lot.visitedGoals, to],
    });
  }
  if (remaining !== 0n) throw new Error("Insufficient provenance shares");
  return {lots: next, moved};
}

/**
 * Count only the initial assignment of a source lot to its first goal.
 * A lot that has visited ANY goal is never new qualifying savings again.
 * This calculation must be applied to the pre-movement lots, not bucket state.
 */
export function countFirstGoalAllocations(
  moved: readonly ProvenanceLot[],
  goal: AllocationBucketKey,
): bigint {
  if (goal === "UNASSIGNED") throw new Error("Destination must be a goal");
  return moved.reduce((total, lot) =>
    total + (lot.bucket === "UNASSIGNED" &&
      lot.visitedGoals.length === 0 &&
      (lot.originKind === "OPENING" || lot.originKind === "EXTERNAL_DEPOSIT")
      ? lot.shares : 0n), 0n);
}
