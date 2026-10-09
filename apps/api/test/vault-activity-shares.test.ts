import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectDatabase, type DatabaseConnection } from "../src/db/client.js";
import { listIndexedDepositCandidates } from "../src/persistence/indexed-vault-deposits.js";

const url = process.env.TEST_DATABASE_URL ??
  "postgresql://kept:kept_local_dev@127.0.0.1:55432/kept_test";
let connection: DatabaseConnection;
beforeAll(() => { connection = connectDatabase(url); });
afterAll(async () => { await connection?.close(); });

describe("vault activity share indexing schema", () => {
  it("stores exact shares independently of assets", async () => {
    const hash = "0x" + randomUUID().replaceAll("-", "").padEnd(64, "0");
    const id = randomUUID();
    await connection.pool.query(
      `INSERT INTO vault_activity_events
         (id, chain_id, vault_address, account_address, event_type, assets_atomic,
          shares_atomic, block_number, transaction_hash, log_index, created_at)
       VALUES ($1, 143, $2, $3, 'DEPOSIT', 198, 200, 100, $4, 1, now())`,
      [id, "0x" + "1".repeat(40), "0x" + "2".repeat(40), hash],
    );
    const row = await connection.pool.query<{shares_atomic:string;assets_atomic:string}>(
      "SELECT shares_atomic::text,assets_atomic::text FROM vault_activity_events WHERE id=$1",
      [id],
    );
    expect(row.rows[0]).toEqual({shares_atomic:"200",assets_atomic:"198"});
    await connection.pool.query("DELETE FROM vault_activity_events WHERE id=$1",[id]);
  });

  it("does not manufacture shares for historical asset-only events", async () => {
    const id = randomUUID();
    const hash = "0x" + randomUUID().replaceAll("-", "").padEnd(64, "0");
    await connection.pool.query(
      `INSERT INTO vault_activity_events
         (id,chain_id,vault_address,account_address,event_type,assets_atomic,
          block_number,transaction_hash,log_index,created_at)
       VALUES ($1,143,$2,$3,'DEPOSIT',10,101,$4,2,now())`,
      [id,"0x" + "1".repeat(40),"0x" + "2".repeat(40),hash],
    );
    const row = await connection.pool.query<{shares_atomic:string|null}>(
      "SELECT shares_atomic::text FROM vault_activity_events WHERE id=$1",[id],
    );
    expect(row.rows[0]?.shares_atomic).toBeNull();
    await connection.pool.query("DELETE FROM vault_activity_events WHERE id=$1",[id]);
  });

  it("lists only share-bearing deposits for the exact chain, vault and owner", async () => {
    const vault = "0x" + "1".repeat(40);
    const owner = "0x" + "2".repeat(40);
    const hash = "0x" + randomUUID().replaceAll("-", "").padEnd(64,"0");
    const id = randomUUID();
    const otherId = randomUUID();
    const insert = `INSERT INTO vault_activity_events
      (id,chain_id,vault_address,account_address,event_type,assets_atomic,
       shares_atomic,block_number,transaction_hash,log_index,created_at)
      VALUES ($1,143,$2,$3,$4,198,$5,100,$6,$7,now())`;
    try {
      await connection.pool.query(insert,[id,vault,owner,"DEPOSIT","200",hash,10]);
      await connection.pool.query(insert,[otherId,vault,owner,"WITHDRAW","10",hash,11]);
      const found = await listIndexedDepositCandidates(connection.db,{
        chainId:143n,vaultAddress:vault,ownerAddress:owner,
      });
      const candidate = found.find(row => row.transactionHash === hash && row.logIndex === 10);
      expect(candidate).toMatchObject({
        chainId:143n,shares:200n,assets:198n,blockNumber:100n,logIndex:10,
      });
      expect(found.some(row => row.transactionHash === hash && row.logIndex === 11)).toBe(false);
      expect((await listIndexedDepositCandidates(connection.db,{
        chainId:1n,vaultAddress:vault,ownerAddress:owner,
      })).some(row => row.transactionHash === hash)).toBe(false);
    } finally {
      await connection.pool.query("DELETE FROM vault_activity_events WHERE id IN ($1,$2)",[id,otherId]);
    }
  });

  it("rejects negative share amounts", async () => {
    const hash = "0x" + randomUUID().replaceAll("-", "").padEnd(64, "0");
    await expect(connection.pool.query(
      `INSERT INTO vault_activity_events
         (id,chain_id,vault_address,account_address,event_type,assets_atomic,
          shares_atomic,block_number,transaction_hash,log_index,created_at)
       VALUES ($1,143,$2,$3,'DEPOSIT',10,-1,102,$4,3,now())`,
      [randomUUID(),"0x" + "1".repeat(40),"0x" + "2".repeat(40),hash],
    )).rejects.toThrow();
  });
});
