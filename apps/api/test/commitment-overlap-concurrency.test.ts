import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,beforeEach,describe,expect,it} from "vitest";
import {connectDatabase,type DatabaseConnection} from "../src/db/client.js";
import {KeptPersistenceService} from "../src/persistence/service.js";

const url=process.env.TEST_DATABASE_URL ??
  "postgresql://kept:kept_local_dev@127.0.0.1:55432/kept_test";
let connection:DatabaseConnection;
beforeAll(()=>{connection=connectDatabase(url);});
beforeEach(async()=>{await connection.pool.query("TRUNCATE users CASCADE");});
afterAll(async()=>{await connection?.close();});

describe.sequential("weekly commitment overlapping activation transactions",()=>{
  it("permits only one of two simultaneous, overlapping draft activations",async()=>{
    const userId=randomUUID(),goalId=randomUUID();
    const wallet="0x0000000000000000000000000000000000000011";
    const a=randomUUID(),b=randomUUID();
    const start="2026-10-01T00:00:00.000Z",end="2026-10-08T00:00:00.000Z";
    await connection.pool.query(
      "INSERT INTO users(id,privy_user_id,created_at,updated_at) VALUES ($1,$2,now(),now())",
      [userId,`privy:${userId}`],
    );
    await connection.pool.query(
      "INSERT INTO wallets(id,user_id,wallet_kind,chain_id,address,is_primary,created_at) VALUES($1,$2,'embedded',143,$3,true,now())",
      [randomUUID(),userId,wallet],
    );
    await connection.pool.query(
      "INSERT INTO savings_goals(id,user_id,name,target_amount_atomic,created_at,updated_at) VALUES($1,$2,'Savings',1000000,now(),now())",
      [goalId,userId],
    );
    const [def] = (await connection.pool.query<{id:string}>(
      `INSERT INTO commitment_definitions
        (id,code,version,verification_class,parameter_schema,active,created_at)
       VALUES($1,'WEEKLY_SAVINGS_V1',1,'ONCHAIN','{}'::jsonb,true,now())
       ON CONFLICT (code,version) DO UPDATE SET active=true
       RETURNING id`,[randomUUID()],
    )).rows;
    expect(def?.id).toBeDefined();
    for(const id of [a,b]){
      await connection.pool.query(
        `INSERT INTO user_commitments
          (id,user_id,savings_goal_id,definition_id,parameters,epoch_start,epoch_end,
           verification_deadline,state,state_version,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$7,'DRAFT',1,now(),now())`,
        [id,userId,goalId,def!.id,
         JSON.stringify({targetAmountAtomic:"1000000",periodDays:7}),start,end],
      );
    }
    const service=new KeptPersistenceService(connection.db);
    const activate=(id:string,seed:string)=>service.activateCommitment({
      userId,commitmentId:id,expectedVersion:1,
      onchainCommitmentId:seed==="a"?"101":"102",
      settlementOwner:wallet,settlementChainId:143,
      settlementStatus:1,idempotencyKey:`concurrent-${id}`,
    });
    const results=await Promise.allSettled([activate(a,"a"),activate(b,"b")]);
    expect(results.filter(item=>item.status==="fulfilled")).toHaveLength(1);
    const failure=results.find(item=>item.status==="rejected");
    expect(failure?.status).toBe("rejected");
    if(failure?.status==="rejected") {
      expect(String(failure.reason)).toMatch(/qualifying commitment in the selected period/);
    }
    const rows=await connection.pool.query<{state:string}>(
      "SELECT state FROM user_commitments WHERE id=ANY($1::uuid[])",
      [[a,b]],
    );
    expect(rows.rows.filter(row=>row.state==="ACTIVE")).toHaveLength(1);
    expect(rows.rows.filter(row=>row.state==="DRAFT")).toHaveLength(1);
  });
});
