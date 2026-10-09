import { describe, expect, it } from "vitest";
import type { GoalDto } from "../src/api/kept-api";
import { sortGoalsByTargetDate } from "../src/features/goals/sort";

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
