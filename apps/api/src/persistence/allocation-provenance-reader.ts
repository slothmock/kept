import { and, asc, eq, gte, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { KeptDatabase } from "../db/client.js";
import {
  allocationBuckets, allocationLedgerEvents, allocationTransferLotMovements,
} from "../db/schema.js";
import type { AllocationProvenanceMovement } from "../verifier/allocation-provenance-evidence.js";

/** Historical evidence only; never infer past transfers from current share lots. */
export async function readAllocationProvenanceMovements(
  db: KeptDatabase,
  input: { userId: string; startAt: Date; endAt: Date },
): Promise<readonly AllocationProvenanceMovement[]> {
  if (!Number.isFinite(input.startAt.getTime()) || !Number.isFinite(input.endAt.getTime()) ||
      input.endAt <= input.startAt) throw new Error("Invalid provenance period");
  const source = alias(allocationBuckets, "provenance_source");
  const destination = alias(allocationBuckets, "provenance_destination");
  const rows = await db.select({
    movementId: allocationTransferLotMovements.id,
    eventId: allocationTransferLotMovements.eventId,
    at: allocationLedgerEvents.createdAt,
    shares: allocationTransferLotMovements.sharesAtomic,
    originKind: allocationTransferLotMovements.originKind,
    wasEverGoalAllocated: allocationTransferLotMovements.wasEverGoalAllocated,
    sourceKind: source.bucketKind,
    sourceGoalId: source.goalId,
    destinationKind: destination.bucketKind,
    destinationGoalId: destination.goalId,
  }).from(allocationTransferLotMovements)
    .innerJoin(allocationLedgerEvents, eq(allocationTransferLotMovements.eventId, allocationLedgerEvents.id))
    .innerJoin(source, eq(allocationTransferLotMovements.sourceBucketId, source.id))
    .innerJoin(destination, eq(allocationTransferLotMovements.destinationBucketId, destination.id))
    .where(and(
      eq(allocationTransferLotMovements.userId, input.userId),
      gte(allocationLedgerEvents.createdAt, input.startAt),
      lte(allocationLedgerEvents.createdAt, input.endAt),
    ))
    .orderBy(asc(allocationLedgerEvents.createdAt), asc(allocationTransferLotMovements.eventId), asc(allocationTransferLotMovements.id));
  return rows.map(row => {
    if (row.sourceKind === "GOAL" && !row.sourceGoalId ||
        row.destinationKind === "GOAL" && !row.destinationGoalId) {
      throw new Error("Incomplete historical transfer bucket");
    }
    return {
      movementId: row.movementId,
      eventId: row.eventId,
      at: row.at,
      source: row.sourceKind === "UNASSIGNED" ? "UNASSIGNED" as const : `GOAL:${row.sourceGoalId}` as const,
      destination: row.destinationKind === "UNASSIGNED" ? "UNASSIGNED" as const : `GOAL:${row.destinationGoalId}` as const,
      shares: BigInt(row.shares),
      verifiedFreshUnassigned: row.sourceKind === "UNASSIGNED" &&
        row.originKind === "EXTERNAL_DEPOSIT" && !row.wasEverGoalAllocated,
    };
  });
}
