import {describe,expect,it} from "vitest";
import {hasOverlappingRewardEpoch} from "../src/domain/commitment-overlap.js";
const start=new Date("2026-10-01T00:00:00Z");
const end=new Date("2026-10-08T00:00:00Z");
const existing=[{
  id:"previous",savingsGoalId:"goal-1",definitionCode:"WEEKLY_SAVINGS_V1",
  state:"COMPLETED",epochStart:start,epochEnd:end,
}];
function check(overrides:Partial<Parameters<typeof hasOverlappingRewardEpoch>[0]>={}){
  return hasOverlappingRewardEpoch({
    commitmentId:"new",goalId:"goal-1",definitionCode:"WEEKLY_SAVINGS_V1",
    epochStart:new Date("2026-10-07T00:00:00Z"),
    epochEnd:new Date("2026-10-14T00:00:00Z"),existing,...overrides,
  });
}
describe("weekly savings reward epoch overlap",()=>{
  it("rejects overlapping completed commitments",()=>expect(check()).toBe(true));
  it("rejects overlapping active commitments",()=>expect(check({
    existing:[{...existing[0]!,state:"ACTIVE"}],
  })).toBe(true));
  it("allows adjacent half-open weeks",()=>expect(check({
    epochStart:end,epochEnd:new Date("2026-10-15T00:00:00Z"),
  })).toBe(false));
  it("ignores failed cancelled and draft commitments",()=>{
    for(const state of ["FAILED","CANCELLED","DRAFT"]){
      expect(check({existing:[{...existing[0]!,state}]})).toBe(false);
    }
  });
  it("allows a distinct goal or definition and ignores its own record",()=>{
    expect(check({goalId:"goal-2"})).toBe(false);
    expect(check({definitionCode:"OTHER"})).toBe(false);
    expect(check({commitmentId:"previous"})).toBe(false);
  });
  it("rejects invalid epochs",()=>expect(()=>check({epochStart:end,epochEnd:start})).toThrow());
});
