import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,beforeEach,describe,expect,it} from "vitest";
import {connectDatabase,type DatabaseConnection} from "../src/db/client.js";
import {AllocationLedgerStore} from "../src/persistence/allocation-ledger-store.js";
import {KeptPersistenceService} from "../src/persistence/service.js";
import {AllocationWeeklySavingsEvidenceSource} from "../src/verifier/allocation-weekly-savings-evidence.js";
import {readAllocationGoalWithdrawals,readQualifiedGoalShares} from "../src/persistence/allocation-provenance-reader.js";

const url = process.env.TEST_DATABASE_URL ??
  "postgresql://kept:kept_local_dev@127.0.0.1:55432/kept_test";
let connection: DatabaseConnection;
let ledger: AllocationLedgerStore;
beforeAll(()=>{connection=connectDatabase(url);ledger=new AllocationLedgerStore(connection.db);});
beforeEach(async()=>{await connection.pool.query("TRUNCATE users CASCADE");});
afterAll(async()=>{await connection?.close();});
const vault = "0x" + "1".repeat(40);
const chainId = 143n;

async function fixture() {
  const userId=randomUUID();
  const address="0x"+randomUUID().replaceAll("-","").padStart(40,"0");
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
  it("claims indexed deposits before a clean-start goal balance read",async()=>{
    const {userId,claim}=await fixture();
    const goalId=randomUUID();
    await connection.pool.query(
      "INSERT INTO savings_goals(id,user_id,name,target_amount_atomic,created_at,updated_at) VALUES($1,$2,'Goal',100,now(),now())",
      [goalId,userId],
    );
    const service=new KeptPersistenceService(connection.db,{
      chainId:143n,vaultAddress:vault,
      reader:{
        readShares:async()=>20n,
        convertToAssets:async(shares:bigint)=>shares,
      },
    },undefined,()=>({ready:true,currentBlock:101n,targetBlock:101n}));
    const result=await service.getGoalAllocation(userId,goalId,claim.ownerAddress);
    expect(result?.allocatedSharesAtomic).toBe("0");
    expect(await ledger.getBalances(userId)).toEqual({UNASSIGNED:20n});
    const lots=await connection.pool.query<{origin_kind:string}>(
      "SELECT origin_kind FROM allocation_share_lots WHERE user_id=$1",[userId],
    );
    expect(lots.rows).toEqual([{origin_kind:"EXTERNAL_DEPOSIT"}]);
    await service.getGoalAllocation(userId,goalId,claim.ownerAddress);
    const claims=await connection.pool.query(
      "SELECT id FROM allocation_deposit_claims WHERE user_id=$1",[userId],
    );
    expect(claims.rows).toHaveLength(1);
  });

  it("does not reconcile a new deposit while the index is behind",async()=>{
    const {userId,claim}=await fixture();
    const goalId=randomUUID();
    await connection.pool.query(
      "INSERT INTO savings_goals(id,user_id,name,target_amount_atomic,created_at,updated_at) VALUES($1,$2,'Goal',100,now(),now())",
      [goalId,userId],
    );
    const service=new KeptPersistenceService(connection.db,{
      chainId:143n,vaultAddress:vault,
      reader:{
        readShares:async()=>20n,
        convertToAssets:async(shares:bigint)=>shares,
      },
    },undefined,()=>({ready:true,currentBlock:100n,targetBlock:101n}));
    await expect(service.getGoalAllocation(userId,goalId,claim.ownerAddress))
      .rejects.toThrow(/index is synchronizing/);
    expect(await ledger.getBalances(userId)).toEqual({});
    const claims=await connection.pool.query(
      "SELECT id FROM allocation_deposit_claims WHERE user_id=$1",[userId],
    );
    expect(claims.rows).toHaveLength(0);
  });

  it("reads live vault shares internally rather than accepting a supplied balance",async()=>{
    const {userId,claim}=await fixture();
    let reads=0;
    const service=new KeptPersistenceService(connection.db,{
      chainId:143n,
      vaultAddress:vault,
      reader:{
        readShares:async()=>{reads++;return 20n;},
        convertToAssets:async(shares:bigint)=>shares,
      },
    });
    const input={
      userId,
      walletAddress:claim.ownerAddress,
      transactionHash:claim.transactionHash,
      logIndex:claim.logIndex,
    };
    const result=await service.claimVerifiedVaultDeposit(input);
    expect(result.status).toBe("CREDITED");
    expect(reads).toBe(1);
    expect(await ledger.getBalances(userId)).toEqual({UNASSIGNED:20n});
  });
  it("refuses to claim deposits when no trusted vault is configured",async()=>{
    const {userId,claim}=await fixture();
    const service=new KeptPersistenceService(connection.db,{
      chainId:143n,
      reader:{
        readShares:async()=>20n,
        convertToAssets:async(shares:bigint)=>shares,
      },
    });
    await expect(service.claimVerifiedVaultDeposit({
      userId,walletAddress:claim.ownerAddress,transactionHash:claim.transactionHash,logIndex:claim.logIndex,
    })).rejects.toThrow(/Trusted vault address/);
    expect(await ledger.getBalances(userId)).toEqual({});
  });
  it("credits two confirmed deposits atomically and never credits them twice",async()=>{
    const {userId,claim}=await fixture();
    const secondHash="0x"+randomUUID().replaceAll("-","").padEnd(64,"0");
    await connection.pool.query(
      `INSERT INTO vault_activity_events
        (id,chain_id,vault_address,account_address,event_type,assets_atomic,
         shares_atomic,block_number,transaction_hash,log_index,created_at)
       VALUES ($1,143,$2,$3,'DEPOSIT',29,30,101,$4,0,now())`,
      [randomUUID(),vault,claim.ownerAddress,secondHash],
    );
    const input={userId,chainId,vaultAddress:vault,ownerAddress:claim.ownerAddress,liveVaultShares:50n};
    await expect(ledger.claimIndexedDeposit({...claim,liveVaultShares:50n}))
      .rejects.toThrow(/uniquely attributed/);
    expect(await ledger.claimIndexedDepositBatch(input)).toEqual({credited:2,shares:50n});
    expect(await ledger.claimIndexedDepositBatch(input)).toEqual({credited:0,shares:0n});
    expect(await ledger.getBalances(userId)).toEqual({UNASSIGNED:50n});
    const origins=await connection.pool.query<{origin_kind:string;total:string}>(
      `SELECT origin_kind,sum(shares_atomic)::text AS total
       FROM allocation_share_lots WHERE user_id=$1 GROUP BY origin_kind`,[userId],
    );
    expect(origins.rows).toEqual([{origin_kind:"EXTERNAL_DEPOSIT",total:"50"}]);
    const claims=await connection.pool.query(
      "SELECT id FROM allocation_deposit_claims WHERE user_id=$1",[userId],
    );
    expect(claims.rows).toHaveLength(2);
  });

  it("rejects a partially reconciled deposit batch without writing claims",async()=>{
    const {userId,claim}=await fixture();
    await ledger.recordVaultChange({
      userId,kind:"RECONCILIATION_CREDIT",shares:10n,key:"prior-reconciliation",
    });
    await expect(ledger.claimIndexedDepositBatch({
      userId,chainId,vaultAddress:vault,ownerAddress:claim.ownerAddress,liveVaultShares:20n,
    })).rejects.toThrow(/uniquely attributed/);
    const claims=await connection.pool.query(
      "SELECT id FROM allocation_deposit_claims WHERE user_id=$1",[userId],
    );
    expect(claims.rows).toHaveLength(0);
    expect(await ledger.getBalances(userId)).toEqual({UNASSIGNED:10n});
  });

  it("reads direct goal withdrawal entries without counting internal transfers",async()=>{
    const {userId,claim}=await fixture();
    const goalId=randomUUID();
    await connection.pool.query(
      "INSERT INTO savings_goals(id,user_id,name,target_amount_atomic,created_at,updated_at) VALUES($1,$2,'Goal',100,now(),now())",
      [goalId,userId],
    );
    const startAt=new Date(Date.now()-60_000);
    await ledger.claimIndexedDeposit(claim);
    await ledger.transfer({
      userId,from:"UNASSIGNED",to:`GOAL:${goalId}`,shares:15n,key:"allocate",
    });
    await ledger.reconcileToVaultShares({userId,liveShares:10n,key:"withdraw-all-unassigned"});
    await ledger.reconcileToVaultShares({userId,liveShares:7n,key:"withdraw-from-goal"});
    const withdrawals=await readAllocationGoalWithdrawals(connection.db,{
      userId,startAt,endAt:new Date(Date.now()+60_000),
    });
    expect(withdrawals).toHaveLength(2);
    expect(withdrawals.every(row=>row.goalId===goalId)).toBe(true);
    expect(withdrawals.reduce((sum,row)=>sum+row.shares,0n)).toBe(8n);
    expect(await readQualifiedGoalShares(connection.db,{
      userId,goalId,startAt,endAt:new Date(Date.now()+60_000),
    })).toBe(7n);
  });

  it("preserves genuine deposit provenance on surviving lots after a withdrawal",async()=>{
    const {userId,claim}=await fixture();
    const goalId=randomUUID();
    await connection.pool.query(
      "INSERT INTO savings_goals(id,user_id,name,target_amount_atomic,created_at,updated_at) VALUES($1,$2,'Goal',100,now(),now())",
      [goalId,userId],
    );
    expect((await ledger.claimIndexedDeposit(claim)).status).toBe("CREDITED");
    await ledger.transfer({
      userId,from:"UNASSIGNED",to:`GOAL:${goalId}`,shares:15n,key:"allocate",
    });
    await ledger.reconcileToVaultShares({userId,liveShares:12n,key:"withdraw-8"});
    expect(await ledger.getBalances(userId)).toEqual({
      UNASSIGNED:0n,[`GOAL:${goalId}`]:12n,
    });
    const lots=await connection.pool.query<{
      origin_kind:string;origin_event_id:string;shares_atomic:string;
    }>(
      "SELECT origin_kind,origin_event_id,shares_atomic::text FROM allocation_share_lots WHERE user_id=$1",
      [userId],
    );
    expect(lots.rows).toHaveLength(1);
    expect(lots.rows[0]?.origin_kind).toBe("EXTERNAL_DEPOSIT");
    expect(lots.rows[0]?.shares_atomic).toBe("12");
    const claimRow=await connection.pool.query<{ledger_event_id:string}>(
      "SELECT ledger_event_id FROM allocation_deposit_claims WHERE user_id=$1",[userId],
    );
    expect(lots.rows[0]?.origin_event_id).toBe(claimRow.rows[0]?.ledger_event_id);
  });

  it("produces read-only weekly verifier evidence from verified allocations",async()=>{
    const {userId,claim}=await fixture();
    const goalId=randomUUID();
    await connection.pool.query(
      "INSERT INTO savings_goals(id,user_id,name,target_amount_atomic,created_at,updated_at) VALUES($1,$2,'Goal',100,now(),now())",
      [goalId,userId],
    );
    const startAt=new Date(Date.now()-60_000);
    expect((await ledger.claimIndexedDeposit(claim)).status).toBe("CREDITED");
    await ledger.transfer({
      userId,from:"UNASSIGNED",to:`GOAL:${goalId}`,shares:15n,key:"initial-eligible-allocation",
    });
    const source=new AllocationWeeklySavingsEvidenceSource({
      db:connection.db,chainId,
      repository:{findPrimaryWalletForOwnerOnChain:async()=>({address:claim.ownerAddress})},
      vaultShares:{
        readShares:async()=>20n,
        convertToAssets:async(shares:bigint)=>shares*2n,
      },
      vaultActivity:{readActivity:async()=>({
        depositedAssets:40n,withdrawnAssets:0n,netAssets:40n,
      })},
    });
    const result=await source.evaluatePeriod({
      userId,goalId,startAt,endAt:new Date(Date.now()+60_000),
    });
    expect(result.netSavedAtomic).toBe(30n);
    expect(result.averageEligibleBalanceAtomic>=0n).toBe(true);
    expect(result.averageEligibleBalanceAtomic<=30n).toBe(true);
    const capSource=new AllocationWeeklySavingsEvidenceSource({
      db:connection.db,chainId,
      repository:{findPrimaryWalletForOwnerOnChain:async()=>({address:claim.ownerAddress})},
      vaultShares:{
        readShares:async()=>20n,
        convertToAssets:async(shares:bigint)=>shares*2n,
      },
      vaultActivity:{readActivity:async()=>({
        depositedAssets:40n,withdrawnAssets:35n,netAssets:5n,
      })},
    });
    expect((await capSource.evaluatePeriod({
      userId,goalId,startAt,endAt:new Date(Date.now()+60_000),
    })).netSavedAtomic).toBe(5n);
  });

  it("evaluates ledger history after a withdrawal without mutating provenance",async()=>{
    const {userId,claim}=await fixture();
    const goalId=randomUUID();
    await connection.pool.query(
      "INSERT INTO savings_goals(id,user_id,name,target_amount_atomic,created_at,updated_at) VALUES($1,$2,'Goal',100,now(),now())",
      [goalId,userId],
    );
    const startAt=new Date(Date.now()-60_000);
    await ledger.claimIndexedDeposit(claim);
    await ledger.transfer({
      userId,from:"UNASSIGNED",to:`GOAL:${goalId}`,shares:15n,key:"e2e-allocate",
    });
    await ledger.reconcileToVaultShares({userId,liveShares:7n,key:"e2e-withdraw"});
    const before=await ledger.getBalances(userId);
    const source=new AllocationWeeklySavingsEvidenceSource({
      db:connection.db,chainId,
      repository:{findPrimaryWalletForOwnerOnChain:async()=>({address:claim.ownerAddress})},
      vaultShares:{readShares:async()=>7n,convertToAssets:async(shares:bigint)=>shares},
      vaultActivity:{readActivity:async()=>({
        depositedAssets:20n,withdrawnAssets:13n,netAssets:7n,
      })},
    });
    const result=await source.evaluatePeriod({
      userId,goalId,startAt,endAt:new Date(Date.now()+60_000),
    });
    expect(result.netSavedAtomic).toBe(7n);
    expect(result.averageEligibleBalanceAtomic).toBeGreaterThanOrEqual(0n);
    expect(await ledger.getBalances(userId)).toEqual(before);
    expect(await readQualifiedGoalShares(connection.db,{
      userId,goalId,startAt,endAt:new Date(Date.now()+60_000),
    })).toBe(7n);
  });

  it("does not requalify the same deposit in a later commitment after goal recycling",async()=>{
    const {userId,claim}=await fixture();
    const goalId=randomUUID();
    await connection.pool.query(
      "INSERT INTO savings_goals(id,user_id,name,target_amount_atomic,created_at,updated_at) VALUES($1,$2,'Goal',100,now(),now())",
      [goalId,userId],
    );
    const epochStart=new Date(Date.now()-60_000);
    await ledger.claimIndexedDeposit(claim);
    await ledger.transfer({
      userId,from:"UNASSIGNED",to:`GOAL:${goalId}`,shares:20n,key:"first-week-allocation",
    });
    // Separate the periods using recorded wall-clock time rather than a
    // future boundary: otherwise both transfers would land in week one.
    await new Promise(resolve=>setTimeout(resolve,15));
    const epochBoundary=new Date();
    expect(await readQualifiedGoalShares(connection.db,{
      userId,goalId,startAt:epochStart,endAt:epochBoundary,
    })).toBe(20n);
    await new Promise(resolve=>setTimeout(resolve,15));
    await ledger.transfer({
      userId,from:`GOAL:${goalId}`,to:"UNASSIGNED",shares:20n,key:"recycle-out",
    });
    await ledger.transfer({
      userId,from:"UNASSIGNED",to:`GOAL:${goalId}`,shares:20n,key:"recycle-back",
    });
    expect(await readQualifiedGoalShares(connection.db,{
      userId,goalId,startAt:epochBoundary,endAt:new Date(Date.now()+60_000),
    })).toBe(0n);
    const lots=await connection.pool.query<{was_ever_goal_allocated:boolean;origin_kind:string}>(
      "SELECT ever_goal_allocated AS was_ever_goal_allocated,origin_kind FROM allocation_share_lots WHERE user_id=$1",
      [userId],
    );
    expect(lots.rows).toHaveLength(1);
    expect(lots.rows[0]?.was_ever_goal_allocated).toBe(true);
    expect(lots.rows[0]?.origin_kind).toBe("EXTERNAL_DEPOSIT");
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
