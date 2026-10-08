import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { planVaultReconciliation } from "../domain/allocation-reconciliation.js";
import type { KeptDatabase } from "../db/client.js";
import {
  allocationBuckets, allocationLedgerEntries, allocationLedgerEvents, allocationShareLots, allocationTransferLotMovements, users,
} from "../db/schema.js";
import {
  assertLedgerEvent, assertNonnegativeBalances, type AllocationBucketKey,
  type AllocationEventKind,
} from "../domain/allocation-ledger.js";

type LedgerTransaction = Parameters<Parameters<KeptDatabase["transaction"]>[0]>[0];

type CreditDebit = "VAULT_CREDIT" | "VAULT_DEBIT" | "RECONCILIATION_CREDIT" | "RECONCILIATION_DEBIT";

/**
 * All writes are serialized on the owner's user row. Caller must never
 * create ledger entries outside this transaction boundary.
 */
export class AllocationLedgerStore {
  constructor(private readonly db: KeptDatabase) {}

  async getBalances(userId: string): Promise<Record<string, bigint>> {
    return this.db.transaction(tx => this.getBalancesInTransaction(tx, userId));
  }

  async getBalancesInTransaction(tx: LedgerTransaction, userId: string): Promise<Record<string, bigint>> {
    const rows = await tx.select({
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

  /** Check whether the account was explicitly initialized. */
  async hasOpeningInTransaction(tx: LedgerTransaction, userId: string): Promise<boolean> {
    const [opening] = await tx.select({id: allocationLedgerEvents.id})
      .from(allocationLedgerEvents)
      .where(and(eq(allocationLedgerEvents.userId, userId), eq(allocationLedgerEvents.eventKind, "OPENING")))
      .limit(1);
    return opening !== undefined;
  }

  /** Reject stale ledger balances until a verified vault reconciliation occurs. */
  async assertVaultParityInTransaction(tx: LedgerTransaction, userId: string, vaultShares: bigint): Promise<void> {
    if (vaultShares < 0n) throw new Error("Negative live vault shares");
    const balances = await this.getBalancesInTransaction(tx, userId);
    const sum = Object.values(balances).reduce((total, value) => {
      if (value < 0n) throw new Error("Negative ledger bucket balance");
      return total + value;
    }, 0n);
    if (sum !== vaultShares) throw new Error("Ledger and live vault shares are out of sync");
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

  /** Join the API idempotency transaction; do not open a nested transaction. */
  async transferInTransaction(tx: LedgerTransaction, input: {
    userId: string; from: AllocationBucketKey; to: AllocationBucketKey;
    shares: bigint; key: string;
  }): Promise<string> {
    if (input.shares <= 0n) throw new Error("Transfer shares must be positive");
    const legs = [
      {bucket: input.from, deltaShares: -input.shares},
      {bucket: input.to, deltaShares: input.shares},
    ];
    assertLedgerEvent("TRANSFER", legs);
    return this.writeEventInTransaction(tx, {userId:input.userId,kind:"TRANSFER",key:input.key,legs});
  }

  /** Apply an observed vault balance atomically after verified opening. */
  async reconcileToVaultShares(input: {
    userId: string; liveShares: bigint; key: string;
  }): Promise<string | null> {
    return this.db.transaction(tx => this.reconcileToVaultSharesInTransaction(tx, input));
  }

  /** Join the caller's lock and commit boundary. */
  async reconcileToVaultSharesInTransaction(tx: LedgerTransaction, input: {
    userId: string; liveShares: bigint; key: string;
  }): Promise<string | null> {
    if (!input.key.trim()) throw new Error("Reconciliation key required");
    const [owner] = await tx.select({id: users.id}).from(users)
      .where(eq(users.id, input.userId)).for("update");
    if (!owner) throw new Error("Unknown ledger owner");
    if (!(await this.hasOpeningInTransaction(tx, input.userId))) {
      throw new Error("Allocation ledger has no verified opening event");
    }
    const balances = await this.getBalancesInTransaction(tx, input.userId);
    const plan = planVaultReconciliation(balances, input.liveShares);
    if (!plan) return null;
    return this.writeEventInTransaction(tx, {
      userId: input.userId, key: input.key, kind: plan.kind, legs: plan.legs,
    });
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
    return this.db.transaction(async tx => this.writeEventInTransaction(tx, input));
  }

  private async writeEventInTransaction(tx: LedgerTransaction, input: {
    userId: string; kind: AllocationEventKind; key: string;
    legs: readonly {bucket: AllocationBucketKey; deltaShares: bigint}[];
  }): Promise<string> {
    if (!input.key.trim()) throw new Error("Ledger idempotency key required");
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
      // Persist the attribution carried by each share lot in the SAME
      // transaction as the event and its balanced entries.
      const consumed: (typeof allocationShareLots.$inferInsert)[] = [];
      for (const leg of input.legs.filter(leg => leg.deltaShares < 0n)) {
        let outstanding = -leg.deltaShares;
        const sourceId = bucketRows.get(leg.bucket)!.id;
        const lots = await tx.select().from(allocationShareLots)
          .where(and(eq(allocationShareLots.userId, input.userId),eq(allocationShareLots.bucketId, sourceId)))
          .orderBy(asc(allocationShareLots.createdAt),asc(allocationShareLots.id));
        for (const lot of lots) {
          if (outstanding === 0n) break;
          const available = BigInt(lot.sharesAtomic);
          const taken = outstanding < available ? outstanding : available;
          outstanding -= taken;
          if (taken === available) {
            await tx.delete(allocationShareLots).where(eq(allocationShareLots.id, lot.id));
          } else {
            await tx.update(allocationShareLots).set({sharesAtomic:(available-taken).toString()})
              .where(eq(allocationShareLots.id, lot.id));
          }
          consumed.push({
            id:randomUUID(),userId:input.userId,bucketId:sourceId,
            originEventId:lot.originEventId,originKind:lot.originKind,
            sharesAtomic:taken.toString(),everGoalAllocated:lot.everGoalAllocated,
            firstGoalId:lot.firstGoalId,createdAt:now,
          });
        }
        if (outstanding !== 0n) throw new Error("Provenance lots do not cover ledger debit");
      }
      for (const leg of input.legs.filter(leg => leg.deltaShares > 0n)) {
        const destBucket = bucketRows.get(leg.bucket)!;
        if (input.kind === "TRANSFER") {
          if (consumed.reduce((n,lot)=>n+BigInt(lot.sharesAtomic),0n) !== leg.deltaShares) {
            throw new Error("Provenance transfer shares differ from ledger entry");
          }
          await tx.insert(allocationShareLots).values(consumed.map(lot => ({
            ...lot,id:randomUUID(),bucketId:destBucket.id,
            everGoalAllocated:lot.everGoalAllocated || destBucket.bucketKind === "GOAL",
            firstGoalId:lot.firstGoalId ?? (destBucket.bucketKind === "GOAL" ? destBucket.goalId : null),
          })));
          // Preserve each consumed source lot as immutable transfer-time evidence.
          // In particular, never infer historical first allocation from today's lots.
          await tx.insert(allocationTransferLotMovements).values(consumed.map(lot => ({
            id: randomUUID(),
            eventId: id,
            userId: input.userId,
            sourceBucketId: lot.bucketId,
            destinationBucketId: destBucket.id,
            originEventId: lot.originEventId,
            originKind: lot.originKind,
            sharesAtomic: lot.sharesAtomic,
            wasEverGoalAllocated: lot.everGoalAllocated ?? false,
            createdAt: now,
          })));
        } else {
          await tx.insert(allocationShareLots).values({
            id:randomUUID(),userId:input.userId,bucketId:destBucket.id,
            originEventId:id,originKind:input.kind === "OPENING" ? "OPENING" : "UNKNOWN",
            sharesAtomic:leg.deltaShares.toString(),
            everGoalAllocated:destBucket.bucketKind === "GOAL",
            firstGoalId:destBucket.bucketKind === "GOAL" ? destBucket.goalId : null,
            createdAt:now,
          });
        }
      }
      return id;
  }
}
