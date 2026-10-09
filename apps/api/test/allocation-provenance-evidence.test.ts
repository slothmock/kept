import { describe, expect, it } from "vitest";
import { calculateQualifiedGoalShares, type AllocationProvenanceMovement } from "../src/verifier/allocation-provenance-evidence.js";
const startAt = new Date("2026-10-01T00:00:00Z");
const endAt = new Date("2026-10-08T00:00:00Z");
const goalId = "a";
const A = "GOAL:a" as const;
const B = "GOAL:b" as const;
function movement(id: string, source: AllocationProvenanceMovement["source"], destination: AllocationProvenanceMovement["destination"], shares: bigint, verifiedFreshUnassigned = false): AllocationProvenanceMovement {
  return { eventId: id, movementId: id, source, destination, shares, verifiedFreshUnassigned, at: new Date(`2026-10-0${1+Number(id.replace(/\D/g,'') || 1)}T00:00:00Z`) };
}
const score = (movements: AllocationProvenanceMovement[]) => calculateQualifiedGoalShares({goalId,startAt,endAt,movements});
describe("qualified allocation provenance", () => {
  it("counts an eligible source-lot assignment without requiring same-week deposits", () => {
    expect(score([movement('e1','UNASSIGNED',A,20n,true)])).toBe(20n);
  });
  it("does not count unverified or recycled unassigned savings", () => {
    expect(score([movement('e1','UNASSIGNED',A,20n)])).toBe(0n);
  });
  it("does not count goal-to-goal transfers", () => {
    expect(score([movement('e1',B,A,20n)])).toBe(0n);
  });
  it("subtracts transfers out of the goal", () => {
    expect(score([movement('e1','UNASSIGNED',A,20n,true),movement('e2',A,'UNASSIGNED',7n)])).toBe(13n);
  });
  it("does not give recycled lots fresh progress through another goal", () => {
    expect(score([movement('e1',B,'UNASSIGNED',20n),movement('e2','UNASSIGNED',A,20n,false)])).toBe(0n);
  });
  it("clamps negative retained progress to zero", () => {
    expect(score([movement('e1',A,B,100n)])).toBe(0n);
  });
  it("counts each source lot separately when one transfer consumes mixed origins", () => {
    const fresh = movement("e1","UNASSIGNED",A,8n,true);
    const old = {...fresh,movementId:"lot-two",shares:4n,verifiedFreshUnassigned:false};
    expect(score([fresh,old])).toBe(8n);
  });
  it("subtracts direct withdrawals from the committed goal", () => {
    const fresh = movement("e1","UNASSIGNED",A,20n,true);
    const withdrawals = [{
      entryId:"w1",at:new Date("2026-10-04T00:00:00Z"),
      goalId,shares:8n,
    }];
    expect(calculateQualifiedGoalShares({goalId,startAt,endAt,movements:[fresh],withdrawals})).toBe(12n);
    expect(calculateQualifiedGoalShares({
      goalId,startAt,endAt,movements:[fresh],
      withdrawals:[{...withdrawals[0]!,goalId:"another"}],
    })).toBe(20n);
  });
  it("does not double-count transfers as vault withdrawals", () => {
    const fresh=movement("e1","UNASSIGNED",A,20n,true);
    const outbound=movement("e2",A,"UNASSIGNED",7n);
    expect(calculateQualifiedGoalShares({
      goalId,startAt,endAt,movements:[fresh,outbound],
      withdrawals:[{entryId:"vault-withdrawal",at:new Date("2026-10-05T00:00:00Z"),goalId,shares:3n}],
    })).toBe(10n);
  });
  it("rejects duplicate and malformed withdrawal evidence", () => {
    const withdrawal={entryId:"w1",at:new Date("2026-10-04T00:00:00Z"),goalId,shares:5n};
    expect(()=>calculateQualifiedGoalShares({
      goalId,startAt,endAt,movements:[],withdrawals:[withdrawal,withdrawal],
    })).toThrow(/Duplicate withdrawal/);
    expect(()=>calculateQualifiedGoalShares({
      goalId,startAt,endAt,movements:[],withdrawals:[{...withdrawal,shares:0n}],
    })).toThrow(/Invalid withdrawal/);
  });
  it("uses a half-open epoch so an event at the end belongs only to the next week", () => {
    const atEnd={...movement("e1","UNASSIGNED",A,10n,true),at:endAt};
    expect(()=>score([atEnd])).toThrow(/incomplete or unordered/);
    expect(calculateQualifiedGoalShares({
      goalId,startAt:endAt,endAt:new Date("2026-10-15T00:00:00Z"),
      movements:[atEnd],
    })).toBe(10n);
    const withdrawal={entryId:"end-withdrawal",at:endAt,goalId,shares:3n};
    expect(()=>calculateQualifiedGoalShares({
      goalId,startAt,endAt,movements:[],withdrawals:[withdrawal],
    })).toThrow(/incomplete or unordered/);
  });
  it("rejects duplicate and incomplete histories", () => {
    const x=movement('e1','UNASSIGNED',A,20n,true);
    expect(() => score([x,x])).toThrow(/Duplicate/);
    expect(score([{...x,at:startAt}])).toBe(20n);
  });
});
