import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,beforeEach,describe,expect,it} from "vitest";
import {connectDatabase,type DatabaseConnection} from "../src/db/client.js";
import {KeptPersistenceService} from "../src/persistence/service.js";
import {AllocationLedgerStore} from "../src/persistence/allocation-ledger-store.js";

const url=process.env.TEST_DATABASE_URL ??
  "postgresql://kept:kept_local_dev@127.0.0.1:55432/kept_test";
let connection:DatabaseConnection;
beforeAll(()=>{connection=connectDatabase(url);});
beforeEach(async()=>{await connection.pool.query("TRUNCATE users CASCADE");});
afterAll(async()=>{await connection?.close();});
async function createUser() {
  const id=randomUUID();
  await connection.pool.query(
    "INSERT INTO users(id,privy_user_id,created_at,updated_at) VALUES($1,$2,now(),now())",
    [id,`privy:${id}`],
  );
  return id;
}
describe.sequential("embedded wallet clean-start ledger initialization",()=>{
  it("automatically initializes a newly registered empty vault account once",async()=>{
    const userId=await createUser();
    const walletAddress="0x00000000000000000000000000000000000000a1";
    const service=new KeptPersistenceService(connection.db,{
      chainId:143n,reader:{
        readShares:async()=>0n,
        convertToAssets:async(shares:bigint)=>shares,
      },
    });
    const first=await service.ensureEmbeddedWallet({
      userId,chainId:143,address:walletAddress,
    });
    expect(first.address).toBe(walletAddress);
    const ledger=new AllocationLedgerStore(connection.db);
    expect(await ledger.getBalances(userId)).toEqual({});
    const repeat=await service.ensureEmbeddedWallet({
      userId,chainId:143,address:walletAddress,
    });
    expect(repeat.id).toBe(first.id);
    const events=await connection.pool.query<{event_kind:string}>(
      "SELECT event_kind FROM allocation_ledger_events WHERE user_id=$1",[userId],
    );
    expect(events.rows).toEqual([{event_kind:"OPENING"}]);
  });

  it("does not bootstrap a newly registered wallet already holding vault shares",async()=>{
    const userId=await createUser();
    const service=new KeptPersistenceService(connection.db,{
      chainId:143n,reader:{
        readShares:async()=>15n,
        convertToAssets:async(shares:bigint)=>shares,
      },
    });
    await service.ensureEmbeddedWallet({
      userId,chainId:143,address:"0x00000000000000000000000000000000000000a2",
    });
    const events=await connection.pool.query(
      "SELECT id FROM allocation_ledger_events WHERE user_id=$1",[userId],
    );
    expect(events.rows).toHaveLength(0);
  });

  it("does not clean-start an account with historical goal allocations",async()=>{
    const userId=await createUser(),goalId=randomUUID();
    await connection.pool.query(
      "INSERT INTO savings_goals(id,user_id,name,target_amount_atomic,created_at,updated_at) VALUES($1,$2,'Goal',100,now(),now())",
      [goalId,userId],
    );
    await connection.pool.query(
      "INSERT INTO goal_share_allocations(id,user_id,goal_id,share_delta_atomic,reason,created_at) VALUES($1,$2,$3,1,'manual',now())",
      [randomUUID(),userId,goalId],
    );
    const service=new KeptPersistenceService(connection.db,{
      chainId:143n,reader:{
        readShares:async()=>0n,
        convertToAssets:async(shares:bigint)=>shares,
      },
    });
    await service.ensureEmbeddedWallet({
      userId,chainId:143,address:"0x00000000000000000000000000000000000000a3",
    });
    const events=await connection.pool.query(
      "SELECT id FROM allocation_ledger_events WHERE user_id=$1",[userId],
    );
    expect(events.rows).toHaveLength(0);
  });
});
