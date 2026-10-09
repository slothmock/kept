import { describe, expect, it } from "vitest";
import type { GoalDto } from "../src/api/kept-api";
import { sortGoals, sortGoalsByTargetDate } from "../src/features/goals/sort";

function goal(id: string, targetDate: string | null): GoalDto {
  return {
    id, targetDate, userId: "user", name: id, targetAmountAtomic: "1000000",
    targetAsset: "USDC", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("goal date sorting", () => {
  const goals = [goal("undated", null), goal("late", "2026-12-01"),
    goal("early", "2026-10-01")];
  it("shows the soonest dated goal first, with undated last", () => {
    expect(sortGoalsByTargetDate(goals, "soonest").map((g) => g.id))
      .toEqual(["early", "late", "undated"]);
  });
  it("shows the latest dated goal first, with undated last", () => {
    expect(sortGoalsByTargetDate(goals, "latest").map((g) => g.id))
      .toEqual(["late", "early", "undated"]);
  });
  it("does not mutate the input collection", () => {
    sortGoalsByTargetDate(goals, "latest");
    expect(goals[0]?.id).toBe("undated");
  });
});

describe("additional goal sort choices", () => {
  const a = { ...goal("a", "2026-11-01"), name: "Zebra", targetAmountAtomic: "10000000", createdAt: "2026-01-01T00:00:00Z" };
  const b = { ...goal("b", "2026-12-01"), name: "Apple", targetAmountAtomic: "2000000", createdAt: "2026-02-01T00:00:00Z" };
  const funding = new Map([
    ["a", { allocatedShares: 1n, allocatedAssets: 5000000n }],
    ["b", { allocatedShares: 1n, allocatedAssets: 1500000n }],
  ]);

  it("orders saved balances and exact progress independently", () => {
    expect(sortGoals([a, b], "most-saved", funding).map((x) => x.id)).toEqual(["a", "b"]);
    expect(sortGoals([a, b], "least-saved", funding).map((x) => x.id)).toEqual(["b", "a"]);
    expect(sortGoals([a, b], "most-progress", funding).map((x) => x.id)).toEqual(["b", "a"]);
    expect(sortGoals([a, b], "least-progress", funding).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("orders goals by creation date or name", () => {
    expect(sortGoals([a, b], "newest").map((x) => x.id)).toEqual(["b", "a"]);
    expect(sortGoals([a, b], "oldest").map((x) => x.id)).toEqual(["a", "b"]);
    expect(sortGoals([a, b], "name-asc").map((x) => x.id)).toEqual(["b", "a"]);
    expect(sortGoals([a, b], "name-desc").map((x) => x.id)).toEqual(["a", "b"]);
  });
});
