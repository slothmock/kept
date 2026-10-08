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

  it("rejects ownership violations", async () => {
    const owner = await user();
    const other = await user();
    const goalId = await goal(other);
    await store.recordVaultChange({userId: owner, shares: 10n, kind: "VAULT_CREDIT", key: "credit"});
    await expect(store.transfer({userId: owner, from: "UNASSIGNED", to: `GOAL:${goalId}`, shares: 5n, key: "cross-user"})).rejects.toThrow();
  });
});
