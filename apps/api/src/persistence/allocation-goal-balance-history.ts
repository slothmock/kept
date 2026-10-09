import { and, asc, eq, lt, gte, sql } from "drizzle-orm";
import type { KeptDatabase } from "../db/client.js";
import { allocationBuckets, allocationLedgerEntries, allocationLedgerEvents } from "../db/schema.js";

export interface GoalBalanceDelta {
  readonly entryId: string;
  readonly at: Date;
  readonly deltaShares: bigint;
}

/**
 * Historical goal balance is reconstructed from immutable ledger entries,
 * never from legacy allocation rows or today's share-lot positions.
 */
export async function readGoalLedgerBalanceHistory(
  db: KeptDatabase,
  input: {userId:string;goalId:string;startAt:Date;endAt:Date},
): Promise<{openingShares:bigint;deltas:readonly GoalBalanceDelta[]}> {
  if (!Number.isFinite(input.startAt.getTime()) || !Number.isFinite(input.endAt.getTime()) ||
      input.endAt <= input.startAt) throw new Error("Invalid goal ledger period");
  const [opening] = await db.select({
    shares:sql<string>`coalesce(sum(${allocationLedgerEntries.shareDeltaAtomic}),0)`,
  }).from(allocationLedgerEntries)
    .innerJoin(allocationLedgerEvents,eq(allocationLedgerEntries.eventId,allocationLedgerEvents.id))
    .innerJoin(allocationBuckets,eq(allocationLedgerEntries.bucketId,allocationBuckets.id))
    .where(and(
      eq(allocationLedgerEntries.userId,input.userId),
      eq(allocationBuckets.bucketKind,"GOAL"),
      eq(allocationBuckets.goalId,input.goalId),
      lt(allocationLedgerEvents.createdAt,input.startAt),
    ));
  const rows=await db.select({
    entryId:allocationLedgerEntries.id,
    at:allocationLedgerEvents.createdAt,
    shares:allocationLedgerEntries.shareDeltaAtomic,
  }).from(allocationLedgerEntries)
    .innerJoin(allocationLedgerEvents,eq(allocationLedgerEntries.eventId,allocationLedgerEvents.id))
    .innerJoin(allocationBuckets,eq(allocationLedgerEntries.bucketId,allocationBuckets.id))
    .where(and(
      eq(allocationLedgerEntries.userId,input.userId),
      eq(allocationBuckets.bucketKind,"GOAL"),
      eq(allocationBuckets.goalId,input.goalId),
      gte(allocationLedgerEvents.createdAt,input.startAt),
      lt(allocationLedgerEvents.createdAt,input.endAt),
    ))
    .orderBy(asc(allocationLedgerEvents.createdAt),asc(allocationLedgerEntries.id));
  return {openingShares:BigInt(opening?.shares??"0"),
    deltas:rows.map(row=>({entryId:row.entryId,at:row.at,deltaShares:BigInt(row.shares)}))};
}

/** Exact integer time-weighted goal balance, conservatively rounded down. */
export function calculateAverageGoalShares(input:{
  startAt:Date;endAt:Date;openingShares:bigint;deltas:readonly GoalBalanceDelta[];
}):bigint {
  const start=input.startAt.getTime(),end=input.endAt.getTime();
  if (!Number.isFinite(start)||!Number.isFinite(end)||end<=start||input.openingShares<0n) {
    throw new Error("Invalid goal share averaging period");
  }
  let cursor=start,balance=input.openingShares,weighted=0n;
  const ids=new Set<string>();
  for(const delta of input.deltas){
    const at=delta.at.getTime();
    if(!Number.isFinite(at)||at<cursor||at>=end||ids.has(delta.entryId)) {
      throw new Error("Incomplete or unordered ledger balance history");
    }
    ids.add(delta.entryId);
    weighted+=balance*BigInt(at-cursor);
    balance+=delta.deltaShares;
    if(balance<0n)throw new Error("Negative historical goal balance");
    cursor=at;
  }
  weighted+=balance*BigInt(end-cursor);
  return weighted/BigInt(end-start);
}
