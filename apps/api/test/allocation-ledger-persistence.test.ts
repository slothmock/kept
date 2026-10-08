import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { connectDatabase, type DatabaseConnection } from "../src/db/client.js";
import { AllocationLedgerStore } from "../src/persistence/allocation-ledger-store.js";

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

  it("rejects ownership violations", async () => {
    const owner = await user();
    const other = await user();
    const goalId = await goal(other);
    await store.recordVaultChange({userId: owner, shares: 10n, kind: "VAULT_CREDIT", key: "credit"});
    await expect(store.transfer({userId: owner, from: "UNASSIGNED", to: `GOAL:${goalId}`, shares: 5n, key: "cross-user"})).rejects.toThrow();
  });
});
