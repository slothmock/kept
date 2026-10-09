import {describe,expect,it} from "vitest";
import {calculateAverageGoalShares} from "../src/persistence/allocation-goal-balance-history.js";

const startAt=new Date("2026-10-01T00:00:00Z");
const endAt=new Date("2026-10-09T00:00:00Z");
const quarter=new Date("2026-10-03T00:00:00Z");
const threeQuarters=new Date("2026-10-07T00:00:00Z");
describe("ledger goal time-weighted balances",()=>{
  it("preserves opening balances and weights transfers by duration",()=>{
    expect(calculateAverageGoalShares({startAt,endAt,openingShares:100n,deltas:[
      {entryId:"a",at:quarter,deltaShares:100n},
      {entryId:"b",at:threeQuarters,deltaShares:-100n},
    ]})).toBe(150n);
  });
  it("returns zero for a goal that receives and withdraws no shares",()=>{
    expect(calculateAverageGoalShares({startAt,endAt,openingShares:0n,deltas:[]})).toBe(0n);
  });
  it("rejects invalid, unordered and duplicate histories",()=>{
    const move={entryId:"a",at:quarter,deltaShares:10n};
    expect(()=>calculateAverageGoalShares({
      startAt,endAt,openingShares:0n,deltas:[move,move],
    })).toThrow(/Incomplete or unordered/);
    expect(()=>calculateAverageGoalShares({
      startAt,endAt,openingShares:0n,deltas:[{...move,deltaShares:-1n}],
    })).toThrow(/Negative historical/);
    expect(()=>calculateAverageGoalShares({
      startAt:endAt,endAt:startAt,openingShares:0n,deltas:[],
    })).toThrow(/Invalid/);
  });
});
