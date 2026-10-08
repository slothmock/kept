import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectDatabase, type DatabaseConnection } from '../src/db/client.js';
import { AllocationLedgerStore } from '../src/persistence/allocation-ledger-store.js';

const url = process.env.TEST_DATABASE_URL ?? 'postgresql://kept:kept_local_dev@127.0.0.1:55432/kept_test';
let connection: DatabaseConnection;
let store: AllocationLedgerStore;
beforeAll(() => { connection = connectDatabase(url); store = new AllocationLedgerStore(connection.db); });
beforeEach(async () => { await connection.pool.query('TRUNCATE users CASCADE'); });
afterAll(async () => { await connection?.close(); });
async function owner() {
  const userId = randomUUID();
  await connection.pool.query('INSERT INTO users(id,privy_user_id,created_at,updated_at) VALUES($1,$2,now(),now())', [userId, `privy:${userId}`]);
  const a = randomUUID(); const b = randomUUID();
  for (const id of [a,b]) await connection.pool.query('INSERT INTO savings_goals(id,user_id,name,target_amount_atomic,created_at,updated_at) VALUES($1,$2,$3,100,now(),now())', [id,userId,id]);
  return {userId,a:`GOAL:${a}` as const,b:`GOAL:${b}` as const};
}
describe.sequential('persisted allocation lineage', () => {
  it('keeps origin and history through goal A -> unassigned -> goal B', async () => {
    const {userId,a,b} = await owner();
    await store.recordVaultChange({userId,kind:'VAULT_CREDIT',shares:100n,key:'deposit'});
    await store.transfer({userId,from:'UNASSIGNED',to:a,shares:25n,key:'assign-a'});
    await store.transfer({userId,from:a,to:'UNASSIGNED',shares:25n,key:'unassign'});
    await store.transfer({userId,from:'UNASSIGNED',to:b,shares:25n,key:'assign-b'});
    const result = await connection.pool.query<{ origin_event_id:string; ever_goal_allocated:boolean; shares_atomic:string }>(
      `SELECT origin_event_id, ever_goal_allocated, shares_atomic::text FROM allocation_share_lots WHERE user_id=$1 AND bucket_id=(SELECT id FROM allocation_buckets WHERE user_id=$1 AND goal_id=$2)`,[userId,b.slice(5)]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.ever_goal_allocated).toBe(true);
    expect(result.rows[0]?.shares_atomic).toBe('25');
  });
  it('preserves exact share conservation between lots and ledger balances', async () => {
    const {userId,a} = await owner();
    await store.recordVaultChange({userId,kind:'VAULT_CREDIT',shares:50n,key:'credit'});
    await store.transfer({userId,from:'UNASSIGNED',to:a,shares:17n,key:'allocation'});
    const rows = await connection.pool.query<{bucket_kind:string; goal_id:string|null; total:string}>(
      `SELECT b.bucket_kind,b.goal_id,sum(l.shares_atomic)::text AS total FROM allocation_share_lots l JOIN allocation_buckets b ON b.id=l.bucket_id WHERE l.user_id=$1 GROUP BY b.id`,[userId]);
    const actual = Object.fromEntries(rows.rows.map(r=>[r.bucket_kind==='UNASSIGNED'?'UNASSIGNED':`GOAL:${r.goal_id}`,BigInt(r.total)]));
    expect(actual).toEqual(await store.getBalances(userId));
  });
  it('never treats opening or reconciliation credit as verified fresh deposits', async () => {
    const {userId,a} = await owner();
    await store.openPositions({userId, positions:{UNASSIGNED:10n},key:'opening'});
    await store.transfer({userId,from:'UNASSIGNED',to:a,shares:10n,key:'from-opening'});
    const rows = await connection.pool.query<{origin_kind:string}>(`SELECT origin_kind FROM allocation_share_lots WHERE user_id=$1`,[userId]);
    expect(rows.rows).toEqual([{origin_kind:'OPENING'}]);
  });
});
