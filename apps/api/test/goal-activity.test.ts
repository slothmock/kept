import { describe, expect, it } from "vitest";
import { toGoalActivity } from "../src/persistence/goal-activity.js";

describe("goal allocation history mapping", () => {
  const createdAt = new Date("2026-10-09T20:00:00.000Z");
  it("shows goal credits and debits without changing share units", () => {
    const result = toGoalActivity([
      { id: "one", eventId: "e1", eventKind: "TRANSFER", shareDeltaAtomic: "1234567", transferAssetsAtomic: "1500000", createdAt },
      { id: "two", eventId: "e2", eventKind: "TRANSFER", shareDeltaAtomic: "-345678", transferAssetsAtomic: "420000", createdAt },
    ]);
    expect(result.map((item) => [item.kind, item.amountAtomic]))
      .toEqual([["ADDED", "1500000"], ["REMOVED", "420000"]]);
  });
  it("keeps unvalued old movements unknown", () => {
    expect(toGoalActivity([{ id: "old", eventId: "event", eventKind: "TRANSFER", shareDeltaAtomic: "10", transferAssetsAtomic: null, createdAt }])[0]?.amountAtomic).toBeNull();
  });
  it("does not misrepresent reconciliation or opening entries as user movements", () => {
    expect(toGoalActivity([
      { id: "one", eventId: "e1", eventKind: "OPENING", shareDeltaAtomic: "1000000", transferAssetsAtomic: null, createdAt },
      { id: "two", eventId: "e2", eventKind: "RECONCILIATION_CREDIT", shareDeltaAtomic: "2000000", transferAssetsAtomic: null, createdAt },
    ])).toEqual([]);
  });
});
