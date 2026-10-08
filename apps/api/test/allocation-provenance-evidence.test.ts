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
  it("rejects duplicate and incomplete histories", () => {
    const x=movement('e1','UNASSIGNED',A,20n,true);
    expect(() => score([x,x])).toThrow(/Duplicate/);
    expect(score([{...x,at:startAt}])).toBe(20n);
  });
});
