import { describe, expect, it } from "vitest";

import { currentGoalItem } from "../src/features/goals/current.js";

describe("currentGoalItem", () => {
  it("prefers active items", () => {
    const items = [
      { id: "draft", savingsGoalId: "g", state: "DRAFT" },
      { id: "active", savingsGoalId: "g", state: "ACTIVE" },
    ] as const;

    expect(currentGoalItem("g", items)?.id).toBe("active");
  });
});
