/** Immutable evidence captured at the time of a ledger transfer. */
export interface AllocationProvenanceMovement {
  readonly eventId: string;
  /** Unique consumed-lot movement row, distinct from its parent event. */
  readonly movementId: string;
  readonly at: Date;
  readonly source: "UNASSIGNED" | `GOAL:${string}`;
  readonly destination: "UNASSIGNED" | `GOAL:${string}`;
  readonly shares: bigint;
  /** True only when an independently verified eligible lot moves for the first time. */
  readonly verifiedFreshUnassigned: boolean;
}

/**
 * This model is deliberately not inferred from current share lots. It requires
 * immutable, historical, per-transfer source-lot evidence from persistence.
 */
export function calculateQualifiedGoalShares(input: {
  readonly goalId: string;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly movements: readonly AllocationProvenanceMovement[];
}): bigint {
  const start = input.startAt.getTime();
  const end = input.endAt.getTime();
  if (!(end > start)) throw new Error("Invalid commitment epoch");
  const goal = `GOAL:${input.goalId}`;
  let eligible = 0n;
  let netOut = 0n;
  const ids = new Set<string>();
  let previous = start;
  for (const movement of input.movements) {
    const time = movement.at.getTime();
    if (!Number.isFinite(time) || time < start || time > end || time < previous) {
      throw new Error("Provenance history is incomplete or unordered");
    }
    if (ids.has(movement.movementId)) throw new Error("Duplicate provenance movement");
    if (movement.shares <= 0n || movement.source === movement.destination) {
      throw new Error("Invalid provenance movement");
    }
    if (movement.verifiedFreshUnassigned && movement.source !== "UNASSIGNED") {
      throw new Error("Fresh provenance is only valid for unassigned source");
    }
    ids.add(movement.movementId);
    previous = time;
    if (movement.destination === goal && movement.source === "UNASSIGNED" && movement.verifiedFreshUnassigned) {
      eligible += movement.shares;
    }
    // Any departure from the committed goal reduces retained progress, even if
    // the withdrawn shares were not themselves eligible for a new bonus.
    if (movement.source === goal) netOut += movement.shares;
  }
  const retained = eligible - netOut;
  return retained > 0n ? retained : 0n;
}
