import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,beforeEach,describe,expect,it} from "vitest";
import {connectDatabase,type DatabaseConnection} from "../src/db/client.js";
import {AllocationLedgerStore} from "../src/persistence/allocation-ledger-store.js";
import {KeptPersistenceService} from "../src/persistence/service.js";

const url = process.env.TEST_DATABASE_URL ??
  "postgresql://kept:kept_local_dev@127.0.0.1:55432/kept_test";
let connection: DatabaseConnection;
let ledger: AllocationLedgerStore;
beforeAll(()=>{connection=connectDatabase(url);ledger=new AllocationLedgerStore(connection.db);});
beforeEach(async()=>{await connection.pool.query("TRUNCATE users CASCADE");});
afterAll(async()=>{await connection?.close();});
const vault = "0x" + "1".repeat(40);
const address = "0x" + "2".repeat(40);
const chainId = 143n;

async function fixture() {
  const userId=randomUUID();
  const hash="0x"+randomUUID().replaceAll("-","").padEnd(64,"0");
  await connection.pool.query("INSERT INTO users(id,privy_user_id,created_at,updated_at) VALUES($1,$2,now(),now())",[userId,`privy:${userId}`]);
  await connection.pool.query(
    "INSERT INTO wallets(id,user_id,wallet_kind,chain_id,address,is_primary,created_at) VALUES($1,$2,'embedded',143,$3,true,now())",
    [randomUUID(),userId,address],
  );
  await connection.pool.query(
    `INSERT INTO vault_activity_events
      (id,chain_id,vault_address,account_address,event_type,assets_atomic,shares_atomic,block_number,transaction_hash,log_index,created_at)
      VALUES ($1,143,$2,$3,'DEPOSIT',19,20,100,$4,0,now())`,
    [randomUUID(),vault,address,hash],
  );
  await connection.db.transaction(tx=>ledger.initializeEmptyAccountInTransaction(tx,{userId,key:"clean-start:empty-account"}));
  const claim={userId,chainId,vaultAddress:vault,ownerAddress:address,transactionHash:hash,logIndex:0,liveVaultShares:20n};
  return {userId,claim};
}

describe.sequential("atomic verified vault deposit claim",()=>{
  it("reads live vault shares internally rather than accepting a supplied balance",async()=>{
    const {userId,claim}=await fixture();
    let reads=0;
    const service=new KeptPersistenceService(connection.db,{
      chainId:143n,
      reader:{
        readShares:async()=>{reads++;return 20n;},
        convertToAssets:async(shares:bigint)=>shares,
      },
    });
    const input={
      userId,
      walletAddress:address,
      vaultAddress:vault,
      transactionHash:claim.transactionHash,
      logIndex:claim.logIndex,
    };
    const result=await service.claimVerifiedVaultDeposit(input);
    expect(result.status).toBe("CREDITED");
    expect(reads).toBe(1);
    expect(await ledger.getBalances(userId)).toEqual({UNASSIGNED:20n});
  });
  it("credits verified shares and lineage once across idempotent replay",async()=>{
    const {userId,claim}=await fixture();
    const first=await ledger.claimIndexedDeposit(claim);
    expect(first.status).toBe("CREDITED");
    expect(first.eventId).not.toBeNull();
    expect(await ledger.claimIndexedDeposit(claim)).toEqual(first);
    expect(await ledger.getBalances(userId)).toEqual({UNASSIGNED:20n});
    const lots=await connection.pool.query<{origin_kind:string;shares_atomic:string}>(
      "SELECT origin_kind,shares_atomic::text FROM allocation_share_lots WHERE user_id=$1",[userId],
    );
    expect(lots.rows).toEqual([{origin_kind:"EXTERNAL_DEPOSIT",shares_atomic:"20"}]);
    const claims=await connection.pool.query("SELECT id FROM allocation_deposit_claims WHERE user_id=$1",[userId]);
    expect(claims.rows).toHaveLength(1);
  });
  it("records already-reconciled deposits without a second credit",async()=>{
    const {userId,claim}=await fixture();
    await ledger.recordVaultChange({userId,kind:"RECONCILIATION_CREDIT",shares:20n,key:"reconcile"});
    expect(await ledger.claimIndexedDeposit(claim)).toEqual({status:"ALREADY_REFLECTED",eventId:null});
    expect(await ledger.getBalances(userId)).toEqual({UNASSIGNED:20n});
    const kinds=await connection.pool.query<{origin_kind:string}>(
      "SELECT origin_kind FROM allocation_share_lots WHERE user_id=$1",[userId],
    );
    expect(kinds.rows).toEqual([{origin_kind:"UNKNOWN"}]);
  });
  it("refuses ambiguous gaps and unknown owner wallets",async()=>{
    const {userId,claim}=await fixture();
    await ledger.recordVaultChange({userId,kind:"RECONCILIATION_CREDIT",shares:10n,key:"partial"});
    await expect(ledger.claimIndexedDeposit(claim)).rejects.toThrow(/uniquely attributed/);
    await expect(ledger.claimIndexedDeposit({...claim,ownerAddress:vault})).rejects.toThrow(/wallet/);
    const claims=await connection.pool.query("SELECT id FROM allocation_deposit_claims WHERE user_id=$1",[userId]);
    expect(claims.rows).toHaveLength(0);
  });
});
