import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { KeptDatabase } from "../db/client.js";
import {
  allocationBuckets, allocationLedgerEntries, allocationLedgerEvents, users,
} from "../db/schema.js";
import {
  assertLedgerEvent, assertNonnegativeBalances, type AllocationBucketKey,
  type AllocationEventKind,
} from "../domain/allocation-ledger.js";

type CreditDebit = "VAULT_CREDIT" | "VAULT_DEBIT" | "RECONCILIATION_CREDIT" | "RECONCILIATION_DEBIT";

/**
 * All writes are serialized on the owner's user row. Caller must never
 * create ledger entries outside this transaction boundary.
 */
export class AllocationLedgerStore {
  constructor(private readonly db: KeptDatabase) {}

  async getBalances(userId: string): Promise<Record<string, bigint>> {
    const rows = await this.db.select({
      kind: allocationBuckets.bucketKind,
      goalId: allocationBuckets.goalId,
      total: sql<string>`coalesce(sum(${allocationLedgerEntries.shareDeltaAtomic}), 0)`,
    }).from(allocationBuckets)
      .leftJoin(allocationLedgerEntries, eq(allocationLedgerEntries.bucketId, allocationBuckets.id))
      .where(eq(allocationBuckets.userId, userId))
      .groupBy(allocationBuckets.id, allocationBuckets.bucketKind, allocationBuckets.goalId);
    return Object.fromEntries(rows.map(row => [
      row.kind === "UNASSIGNED" ? "UNASSIGNED" : `GOAL:${row.goalId}`,
      BigInt(row.total),
    ]));
  }

  /**
   * Records cutover positions supplied by a separate, verified live-vault
   * snapshot. This never reads or guesses the live balance itself.
   */
  async openPositions(input: {
    userId: string; positions: Readonly<Record<string, bigint>>; key: string;
  }): Promise<string> {
    const legs = Object.entries(input.positions).map(([bucket, deltaShares]) => ({
      bucket: bucket as AllocationBucketKey,
      deltaShares,
    })).filter(leg => leg.deltaShares !== 0n);
    if (legs.length === 0) throw new Error("Opening positions must be nonempty");
    assertLedgerEvent("OPENING", legs);
    return this.writeEvent({
      userId: input.userId, kind: "OPENING", key: input.key, legs,
    });
  }

  async transfer(input: {
    userId: string; from: AllocationBucketKey; to: AllocationBucketKey;
    shares: bigint; key: string;
  }): Promise<string> {
    if (input.shares <= 0n) throw new Error("Transfer shares must be positive");
    const legs = [
      {bucket: input.from, deltaShares: -input.shares},
      {bucket: input.to, deltaShares: input.shares},
    ];
    assertLedgerEvent("TRANSFER", legs);
    return this.writeEvent({userId: input.userId, kind: "TRANSFER", key: input.key, legs});
  }

  async recordVaultChange(input: {
    userId: string; kind: CreditDebit; shares: bigint; key: string;
    bucket?: AllocationBucketKey;
  }): Promise<string> {
    if (input.shares <= 0n) throw new Error("Vault share delta must be positive");
    const sign = input.kind.endsWith("CREDIT") ? 1n : -1n;
    const bucket = input.bucket ?? "UNASSIGNED";
    const legs = [{bucket, deltaShares: sign * input.shares}];
    assertLedgerEvent(input.kind, legs);
    return this.writeEvent({userId: input.userId, kind: input.kind, key: input.key, legs});
  }

  private async writeEvent(input: {
    userId: string; kind: AllocationEventKind; key: string;
    legs: readonly {bucket: AllocationBucketKey; deltaShares: bigint}[];
  }): Promise<string> {
    if (!input.key.trim()) throw new Error("Ledger idempotency key required");
    return this.db.transaction(async tx => {
      // Lock the owner rather than an optionally absent bucket, so concurrent
      // credits, debits and transfers cannot observe the same opening balance.
      const [owner] = await tx.select({id: users.id}).from(users)
        .where(eq(users.id, input.userId)).for("update");
      if (!owner) throw new Error("Unknown ledger owner");
      const [existing] = await tx.select().from(allocationLedgerEvents).where(and(
        eq(allocationLedgerEvents.userId, input.userId),
        eq(allocationLedgerEvents.idempotencyKey, input.key),
      )).limit(1);
      if (existing) {
        const oldLegs = await tx.select({
          kind: allocationBuckets.bucketKind,
          goalId: allocationBuckets.goalId,
          delta: allocationLedgerEntries.shareDeltaAtomic,
        }).from(allocationLedgerEntries)
          .innerJoin(allocationBuckets, eq(allocationLedgerEntries.bucketId, allocationBuckets.id))
          .where(eq(allocationLedgerEntries.eventId, existing.id));
        const expected = input.legs.map(leg => `${leg.bucket}:${leg.deltaShares}`).sort();
        const actual = oldLegs.map(leg => `${leg.kind === "UNASSIGNED" ? "UNASSIGNED" : `GOAL:${leg.goalId}`}:${leg.delta}`).sort();
        if (existing.eventKind !== input.kind || JSON.stringify(expected) !== JSON.stringify(actual)) {
          throw new Error("Ledger idempotency key reused with a different event");
        }
        return existing.id;
      }
      if (input.kind === "OPENING") {
        const [prior] = await tx.select({id: allocationLedgerEvents.id})
          .from(allocationLedgerEvents)
          .where(eq(allocationLedgerEvents.userId, input.userId)).limit(1);
        if (prior) throw new Error("Ledger has already been initialized");
      }
      const bucketRows = new Map<AllocationBucketKey, typeof allocationBuckets.$inferSelect>();
      for (const leg of input.legs) {
        if (bucketRows.has(leg.bucket)) continue;
        const isUnassigned = leg.bucket === "UNASSIGNED";
        const goalId = isUnassigned ? null : leg.bucket.slice(5);
        if (goalId) {
          const result = await tx.execute(sql`SELECT 1 FROM savings_goals WHERE id = ${goalId}::uuid AND user_id = ${input.userId}::uuid`);
          if (result.rows.length !== 1) throw new Error("Goal does not belong to ledger owner");
        }
        await tx.insert(allocationBuckets).values({
          id: randomUUID(), userId: input.userId,
          bucketKind: isUnassigned ? "UNASSIGNED" : "GOAL",
          goalId, createdAt: new Date(),
        }).onConflictDoNothing();
        const [bucket] = await tx.select().from(allocationBuckets).where(and(
          eq(allocationBuckets.userId, input.userId),
          eq(allocationBuckets.bucketKind, isUnassigned ? "UNASSIGNED" : "GOAL"),
          isUnassigned ? sql`${allocationBuckets.goalId} IS NULL` : eq(allocationBuckets.goalId, goalId!),
        )).limit(1);
        if (!bucket) throw new Error("Allocation bucket missing");
        bucketRows.set(leg.bucket, bucket);
      }
      const balances = new Map<AllocationBucketKey, bigint>();
      for (const [key, bucket] of bucketRows) {
        const [sum] = await tx.select({
          total: sql<string>`coalesce(sum(${allocationLedgerEntries.shareDeltaAtomic}), 0)`,
        }).from(allocationLedgerEntries).where(eq(allocationLedgerEntries.bucketId, bucket.id));
        balances.set(key, BigInt(sum?.total ?? "0"));
      }
      assertNonnegativeBalances(balances, input.legs);
      const id = randomUUID();
      const now = new Date();
      await tx.insert(allocationLedgerEvents).values({
        id, userId: input.userId, eventKind: input.kind,
        idempotencyKey: input.key, createdAt: now,
      });
      await tx.insert(allocationLedgerEntries).values(input.legs.map(leg => ({
        id: randomUUID(), eventId: id, userId: input.userId,
        bucketId: bucketRows.get(leg.bucket)!.id,
        shareDeltaAtomic: leg.deltaShares.toString(),
        // UNKNOWN is intentionally non-qualifying until lineage is implemented.
        originKind: input.kind === "OPENING" ? "OPENING" : "UNKNOWN", originEventId: input.kind === "OPENING" ? id : null, createdAt: now,
      })));
      return id;
    });
  }
}
