import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { connectDatabase, type DatabaseConnection } from "../src/db/client.js";
import { AllocationLedgerStore } from "../src/persistence/allocation-ledger-store.js";
import { KeptPersistenceService } from "../src/persistence/service.js";

const url = process.env.TEST_DATABASE_URL ?? "postgresql://kept:kept_local_dev@127.0.0.1:55432/kept_test";
let connection: DatabaseConnection;
let store: AllocationLedgerStore;

beforeAll(() => {
  connection = connectDatabase(url);
  store = new AllocationLedgerStore(connection.db);
});
beforeEach(async () => {
  await connection.pool.query("TRUNCATE users CASCADE");
});
afterAll(async () => { await connection?.close(); });

async function user() {
  const id = randomUUID();
  await connection.pool.query(
    "INSERT INTO users (id,privy_user_id,created_at,updated_at) VALUES ($1,$2,now(),now())",
    [id, `privy:${id}`],
  );
  return id;
}
async function goal(userId: string) {
  const id = randomUUID();
  await connection.pool.query(
    "INSERT INTO savings_goals (id,user_id,name,target_amount_atomic,created_at,updated_at) VALUES ($1,$2,'Laptop',100,now(),now())",
    [id,userId],
  );
  return id;
}

describe.sequential("allocation ledger persistence", () => {
  it("credits unassigned shares and atomically moves shares into a goal", async () => {
    const userId = await user();
    const goalId = await goal(userId);
    await store.recordVaultChange({userId, shares: 100n, kind: "VAULT_CREDIT", key: "deposit-1"});
    await store.transfer({userId, from: "UNASSIGNED", to: `GOAL:${goalId}`, shares: 25n, key: "assign-1"});
    expect(await store.getBalances(userId)).toEqual({
      UNASSIGNED: 75n, [`GOAL:${goalId}`]: 25n,
    });
    const rows = await connection.pool.query(
      "SELECT share_delta_atomic::text AS delta FROM allocation_ledger_entries WHERE event_id = (SELECT id FROM allocation_ledger_events WHERE user_id=$1 AND idempotency_key='assign-1') ORDER BY share_delta_atomic",
      [userId],
    );
    expect(rows.rows.map(row => row.delta)).toEqual(["-25", "25"]);
  });

  it("rejects overdrafts without committing a partial transfer", async () => {
    const userId = await user();
    const goalId = await goal(userId);
    await store.recordVaultChange({userId, shares: 10n, kind: "VAULT_CREDIT", key: "deposit"});
    await expect(store.transfer({userId, from: "UNASSIGNED", to: `GOAL:${goalId}`, shares: 11n, key: "bad"})).rejects.toThrow();
    expect(await store.getBalances(userId)).toEqual({UNASSIGNED: 10n});
  });

  it("deduplicates identical events and rejects reuse with different amounts", async () => {
    const userId = await user();
    const input = {userId, shares: 20n, kind: "VAULT_CREDIT" as const, key: "same"};
    await store.recordVaultChange(input);
    await store.recordVaultChange(input);
    expect(await store.getBalances(userId)).toEqual({UNASSIGNED: 20n});
    await expect(store.recordVaultChange({...input,shares: 30n})).rejects.toThrow();
  });

  it("bootstraps explicit opening positions once without treating them as deposits", async () => {
    const userId = await user();
    const goalId = await goal(userId);
    const positions = {UNASSIGNED: 75n, [`GOAL:${goalId}`]: 25n};
    await store.openPositions({userId, positions, key: "cutover"});
    await store.openPositions({userId, positions, key: "cutover"});
    expect(await store.getBalances(userId)).toEqual(positions);
    await expect(store.openPositions({userId, positions: {UNASSIGNED: 100n}, key: "other-cutover"})).rejects.toThrow();
    const origins = await connection.pool.query(
      "SELECT DISTINCT origin_kind FROM allocation_ledger_entries WHERE user_id=$1", [userId],
    );
    expect(origins.rows.map(row => row.origin_kind)).toEqual(["OPENING"]);
  });

  it("serializes concurrent debits so balances cannot be spent twice", async () => {
    const userId = await user();
    await store.recordVaultChange({userId, shares: 10n, kind: "VAULT_CREDIT", key: "start"});
    const outcomes = await Promise.allSettled([
      store.recordVaultChange({userId, shares: 7n, kind: "VAULT_DEBIT", key: "debit-1"}),
      store.recordVaultChange({userId, shares: 7n, kind: "VAULT_DEBIT", key: "debit-2"}),
    ]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await store.getBalances(userId)).toEqual({UNASSIGNED: 3n});
  });

  it("rolls back a ledger transfer when the outer API transaction fails", async () => {
    const userId = await user();
    const goalId = await goal(userId);
    await store.recordVaultChange({userId, shares: 50n, kind: "VAULT_CREDIT", key: "initial"});
    await expect(connection.db.transaction(async tx => {
      await store.transferInTransaction(tx, {
        userId, from: "UNASSIGNED", to: `GOAL:${goalId}`,
        shares: 30n, key: "rolled-back",
      });
      throw new Error("simulate idempotency completion failure");
    })).rejects.toThrow("simulate idempotency completion failure");
    expect(await store.getBalances(userId)).toEqual({UNASSIGNED: 50n});
    const events = await connection.pool.query(
      "SELECT id FROM allocation_ledger_events WHERE user_id=$1 AND idempotency_key='rolled-back'",
      [userId],
    );
    expect(events.rows).toHaveLength(0);
  });

  it("checks opening status and vault parity in the same transaction", async () => {
    const userId = await user();
    await connection.db.transaction(async tx => {
      expect(await store.hasOpeningInTransaction(tx, userId)).toBe(false);
      await store.assertVaultParityInTransaction(tx, userId, 0n);
    });
    await store.openPositions({userId, positions: {UNASSIGNED: 20n}, key: "bootstrap"});
    await connection.db.transaction(async tx => {
      expect(await store.hasOpeningInTransaction(tx, userId)).toBe(true);
      expect(await store.getBalancesInTransaction(tx, userId)).toEqual({UNASSIGNED: 20n});
      await store.assertVaultParityInTransaction(tx, userId, 20n);
      await expect(store.assertVaultParityInTransaction(tx, userId, 19n))
        .rejects.toThrow("out of sync");
    });
  });

  it("preflights ledger cutover without changing existing goal allocations", async () => {
    const userId = await user();
    const goalId = await goal(userId);
    const service = new KeptPersistenceService(connection.db, {
      chainId: 143n,
      reader: {
        readShares: async () => 100n,
        convertToAssets: async (shares: bigint) => shares,
      },
    });
    const request = {
      userId,
      walletAddress: "0x0000000000000000000000000000000000000001",
    };
    await expect(service.assertGoalAllocationCutoverReady(request)).rejects.toThrow(/opening/);
    await store.openPositions({
      userId, positions: {UNASSIGNED: 100n}, key: "verified-opening",
    });
    await service.assertGoalAllocationCutoverReady(request);
    await store.transfer({
      userId, from: "UNASSIGNED", to: `GOAL:${goalId}`,
      shares: 20n, key: "unmirrored-transfer",
    });
    await expect(service.assertGoalAllocationCutoverReady(request)).rejects.toThrow(/mismatch/);
    const legacy = await connection.pool.query(
      "SELECT count(*)::integer AS count FROM goal_share_allocations WHERE user_id=$1", [userId],
    );
    expect(legacy.rows[0].count).toBe(0);
  });

  it("mirrors initialized allocations and idempotent replay without changing legacy reads", async () => {
    const userId = await user();
    const goalId = await goal(userId);
    const service = new KeptPersistenceService(connection.db, {
      chainId: 143n,
      reader: {readShares: async () => 100n, convertToAssets: async (shares: bigint) => shares},
    });
    await store.openPositions({userId, positions: {UNASSIGNED: 100n}, key: "cutover"});
    const input = {
      userId, goalId, walletAddress: "0x0000000000000000000000000000000000000001",
      reason: "manual", idempotencyKey: "new-allocation", shareDeltaAtomic: "35",
    };
    const first = await service.allocateGoalShares(input);
    expect(first.allocatedSharesAtomic).toBe("35");
    expect(await store.getBalances(userId)).toEqual({UNASSIGNED: 65n, [`GOAL:${goalId}`]: 35n});
    expect(await service.allocateGoalShares(input)).toEqual(first);
    const second = await service.allocateGoalShares({...input, idempotencyKey: "unassign", shareDeltaAtomic: "-10"});
    expect(second.allocatedSharesAtomic).toBe("25");
    expect(await store.getBalances(userId)).toEqual({UNASSIGNED: 75n, [`GOAL:${goalId}`]: 25n});
    await service.assertGoalAllocationCutoverReady({userId, walletAddress: input.walletAddress});
  });

  it("does not mirror an account without an opening ledger", async () => {
    const userId = await user();
    const goalId = await goal(userId);
    const service = new KeptPersistenceService(connection.db, {
      chainId: 143n, reader: {readShares: async () => 50n, convertToAssets: async (s: bigint) => s},
    });
    const result = await service.allocateGoalShares({
      userId, goalId, walletAddress: "0x0000000000000000000000000000000000000001",
      reason: "manual", idempotencyKey: "legacy-only", shareDeltaAtomic: "10",
    });
    expect(result.allocatedSharesAtomic).toBe("10");
    expect(await store.getBalances(userId)).toEqual({});
  });

  it("rolls back legacy writes when mirrored ledger parity fails", async () => {
    const userId = await user();
    const goalId = await goal(userId);
    const service = new KeptPersistenceService(connection.db, {
      chainId: 143n, reader: {readShares: async () => 100n, convertToAssets: async (s: bigint) => s},
    });
    await store.openPositions({userId, positions: {UNASSIGNED: 80n, [`GOAL:${goalId}`]: 20n}, key: "bad-opening"});
    await expect(service.allocateGoalShares({
      userId, goalId, walletAddress: "0x0000000000000000000000000000000000000001",
      reason: "manual", idempotencyKey: "should-rollback", shareDeltaAtomic: "10",
    })).rejects.toThrow(/mismatch/);
    expect(await store.getBalances(userId)).toEqual({UNASSIGNED: 80n, [`GOAL:${goalId}`]: 20n});
    const rows = await connection.pool.query(
      "SELECT count(*)::integer AS n FROM goal_share_allocations WHERE user_id=$1", [userId],
    );
    expect(rows.rows[0].n).toBe(0);
  });

  it("reconciles multi-goal withdrawals atomically and conserves provenance", async () => {
    const userId = await user();
    const goalA = await goal(userId);
    const goalB = await goal(userId);
    await store.openPositions({userId,positions:{UNASSIGNED:20n,[`GOAL:${goalA}`]:200n,[`GOAL:${goalB}`]:100n},key:"opening"});
    const id = await store.reconcileToVaultShares({userId,liveShares:150n,key:"vault-observation-1"});
    expect(id).toBeTruthy();
    expect(await store.getBalances(userId)).toEqual({UNASSIGNED:0n,[`GOAL:${goalA}`]:100n,[`GOAL:${goalB}`]:50n});
    const entries = await connection.pool.query<{share_delta_atomic:string}>(
      "SELECT share_delta_atomic::text FROM allocation_ledger_entries WHERE event_id=$1", [id]);
    expect(entries.rows.map(row => row.share_delta_atomic).sort()).toEqual(["-100","-20","-50"].sort());
    const lotTotal = await connection.pool.query<{total:string}>(
      "SELECT coalesce(sum(shares_atomic),0)::text AS total FROM allocation_share_lots WHERE user_id=$1", [userId]);
    expect(lotTotal.rows[0]?.total).toBe("150");
    expect(await store.reconcileToVaultShares({userId,liveShares:150n,key:"vault-observation-2"})).toBeNull();
  });

  it("credits unexpected shares only to unassigned without qualifying them as deposits", async () => {
    const userId = await user();
    const goalId = await goal(userId);
    await store.openPositions({userId,positions:{UNASSIGNED:5n,[`GOAL:${goalId}`]:15n},key:"opening"});
    await store.reconcileToVaultShares({userId,liveShares:30n,key:"credit"});
    expect(await store.getBalances(userId)).toEqual({UNASSIGNED:15n,[`GOAL:${goalId}`]:15n});
    const credit = await connection.pool.query<{origin_kind:string}>(
      "SELECT origin_kind FROM allocation_share_lots WHERE user_id=$1 AND bucket_id=(SELECT id FROM allocation_buckets WHERE user_id=$1 AND bucket_kind='UNASSIGNED')", [userId]);
    expect(credit.rows.every(row => row.origin_kind !== "EXTERNAL_DEPOSIT")).toBe(true);
  });

  it("reconciles initialized legacy and ledger goal positions together", async () => {
    const userId = await user();
    const goalA = await goal(userId);
    const goalB = await goal(userId);
    let live = 10n;
    const service = new KeptPersistenceService(connection.db, {
      chainId: 143n, reader: {
        readShares: async () => live,
        convertToAssets: async (shares: bigint) => shares,
      },
    });
    const walletAddress = "0x0000000000000000000000000000000000000001";
    const allocate = async (goalId: string, amount: string, key: string) =>
      service.allocateGoalShares({
        userId, goalId, walletAddress, shareDeltaAtomic: amount,
        reason: "manual", idempotencyKey: key,
      });
    await allocate(goalA, "5", "before-opening-a");
    await allocate(goalB, "3", "before-opening-b");
    await store.openPositions({
      userId, key: "opening",
      positions: {UNASSIGNED: 2n, [`GOAL:${goalA}`]: 5n, [`GOAL:${goalB}`]: 3n},
    });
    // The legacy algorithm distributes the single survivor-share remainder
    // in ascending goal UUID order. UUIDs are generated randomly in this test.
    const aWinsRemainder = goalA < goalB;
    const expectedA = aWinsRemainder ? 4n : 3n;
    const expectedB = aWinsRemainder ? 2n : 3n;
    live = 6n;
    expect(await service.reconcileInitializedGoalLedger({userId, walletAddress})).toBe(true);
    expect(await store.getBalances(userId)).toEqual({
      UNASSIGNED: 0n, [`GOAL:${goalA}`]: expectedA, [`GOAL:${goalB}`]: expectedB,
    });
    await service.assertGoalAllocationCutoverReady({userId, walletAddress});
    const legacyA = await service.getGoalAllocation(userId, goalA, walletAddress);
    expect(legacyA?.allocatedSharesAtomic).toBe(expectedA.toString());
    live = 12n;
    expect(await service.reconcileInitializedGoalLedger({userId, walletAddress})).toBe(true);
    expect(await store.getBalances(userId)).toEqual({
      UNASSIGNED: 6n, [`GOAL:${goalA}`]: expectedA, [`GOAL:${goalB}`]: expectedB,
    });
  });

  it("keeps uninitialized users on the legacy reconciliation path", async () => {
    const userId = await user();
    const service = new KeptPersistenceService(connection.db, {
      chainId: 143n, reader: {
        readShares: async () => 12n,
        convertToAssets: async (shares: bigint) => shares,
      },
    });
    expect(await service.reconcileInitializedGoalLedger({
      userId, walletAddress: "0x0000000000000000000000000000000000000001",
    })).toBe(false);
    expect(await store.getBalances(userId)).toEqual({});
  });

  it("automatically reconciles an initialized ledger when reading a goal", async () => {
    const userId = await user();
    const goalId = await goal(userId);
    let live = 100n;
    const walletAddress = "0x0000000000000000000000000000000000000001";
    const service = new KeptPersistenceService(connection.db, {
      chainId: 143n, reader: {
        readShares: async () => live,
        convertToAssets: async (shares: bigint) => shares,
      },
    });
    await service.allocateGoalShares({
      userId, goalId, walletAddress, shareDeltaAtomic: "70",
      reason: "manual", idempotencyKey: "allocation-before-opening",
    });
    await store.openPositions({
      userId, key: "cutover",
      positions: {UNASSIGNED: 30n, [`GOAL:${goalId}`]: 70n},
    });

    live = 40n;
    const allocation = await service.getGoalAllocation(userId, goalId, walletAddress);
    expect(allocation?.allocatedSharesAtomic).toBe("40");
    expect(await store.getBalances(userId)).toEqual({
      UNASSIGNED: 0n, [`GOAL:${goalId}`]: 40n,
    });
    await service.assertGoalAllocationCutoverReady({userId, walletAddress});
    const events = await connection.pool.query<{count:string}>(
      "SELECT count(*)::text AS count FROM allocation_ledger_events WHERE user_id=$1 AND event_kind='RECONCILIATION_DEBIT'",
      [userId],
    );
    expect(events.rows[0]?.count).toBe("1");
    await service.getGoalAllocation(userId, goalId, walletAddress);
    const repeated = await connection.pool.query<{count:string}>(
      "SELECT count(*)::text AS count FROM allocation_ledger_events WHERE user_id=$1 AND event_kind='RECONCILIATION_DEBIT'",
      [userId],
    );
    expect(repeated.rows[0]?.count).toBe("1");
  });

  it("reconciles initialized ledger before processing a new goal allocation", async () => {
    const userId = await user();
    const goalId = await goal(userId);
    let live = 100n;
    const walletAddress = "0x0000000000000000000000000000000000000001";
    const service = new KeptPersistenceService(connection.db, {
      chainId: 143n, reader: {
        readShares: async () => live,
        convertToAssets: async (shares: bigint) => shares,
      },
    });
    await store.openPositions({userId, positions: {UNASSIGNED: 100n}, key: "cutover"});
    live = 70n;
    const result = await service.allocateGoalShares({
      userId, goalId, walletAddress, shareDeltaAtomic: "20",
      reason: "manual", idempotencyKey: "after-external-withdrawal",
    });
    expect(result.allocatedSharesAtomic).toBe("20");
    expect(await store.getBalances(userId)).toEqual({
      UNASSIGNED: 50n, [`GOAL:${goalId}`]: 20n,
    });
    await service.assertGoalAllocationCutoverReady({userId, walletAddress});
  });

  it("rejects ownership violations", async () => {
    const owner = await user();
    const other = await user();
    const goalId = await goal(other);
    await store.recordVaultChange({userId: owner, shares: 10n, kind: "VAULT_CREDIT", key: "credit"});
    await expect(store.transfer({userId: owner, from: "UNASSIGNED", to: `GOAL:${goalId}`, shares: 5n, key: "cross-user"})).rejects.toThrow();
  });
});
