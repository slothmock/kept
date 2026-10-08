import { describe, expect, it } from "vitest";
import {
  moveProvenanceLots, countFirstGoalAllocations, type ProvenanceLot,
} from "../src/domain/allocation-provenance.js";

const a = "GOAL:11111111-1111-4111-8111-111111111111" as const;
const b = "GOAL:22222222-2222-4222-8222-222222222222" as const;
const fresh = (shares: bigint): ProvenanceLot => ({
  bucket: "UNASSIGNED", shares, originEventId: "deposit-1",
  originKind: "EXTERNAL_DEPOSIT", visitedGoals: [],
});
describe("allocation provenance", () => {
  it("counts allocation of previously unassigned shares without a same-week deposit", () => {
    const moved = moveProvenanceLots([fresh(100n)], "UNASSIGNED", a, 25n);
    expect(countFirstGoalAllocations(moved.moved, a)).toBe(25n);
    expect(moved.lots.reduce((sum, lot) => sum + lot.shares, 0n)).toBe(100n);
  });
  it("does not relabel previously assigned shares as new through unassigned", () => {
    const first = moveProvenanceLots([fresh(25n)], "UNASSIGNED", a, 25n);
    const back = moveProvenanceLots(first.lots, a, "UNASSIGNED", 25n);
    const toB = moveProvenanceLots(back.lots, "UNASSIGNED", b, 25n);
    expect(countFirstGoalAllocations(toB.moved, b)).toBe(0n);
    const again = moveProvenanceLots(toB.lots, b, a, 25n);
    expect(countFirstGoalAllocations(again.moved, a)).toBe(0n);
  });
  it("does not count direct goal to goal transfers", () => {
    const first = moveProvenanceLots([fresh(25n)], "UNASSIGNED", a, 25n);
    const second = moveProvenanceLots(first.lots, a, b, 25n);
    expect(countFirstGoalAllocations(second.moved, b)).toBe(0n);
  });
  it("preserves source identity across partial spends", () => {
    const result = moveProvenanceLots([fresh(100n)], "UNASSIGNED", a, 40n);
    expect(result.moved).toMatchObject([{shares: 40n, originEventId: "deposit-1"}]);
    expect(result.lots).toEqual([
      { ...fresh(60n) },
      { ...fresh(40n), bucket: a, visitedGoals: [a] },
    ]);
  });
  it("rejects overspending and nonpositive moves", () => {
    expect(() => moveProvenanceLots([fresh(3n)], "UNASSIGNED", a, 4n)).toThrow();
    expect(() => moveProvenanceLots([fresh(3n)], "UNASSIGNED", a, 0n)).toThrow();
  });
  it("never counts ambiguous or already-goal-assigned opening lots", () => {
    const legacy: ProvenanceLot = {
      bucket: "UNASSIGNED", shares: 25n, originEventId: "cutover",
      originKind: "LEGACY", visitedGoals: [a],
    };
    expect(countFirstGoalAllocations(moveProvenanceLots([legacy], "UNASSIGNED", b, 25n).moved, b)).toBe(0n);
  });
});
