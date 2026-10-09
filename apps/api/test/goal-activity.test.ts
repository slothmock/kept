import { describe, expect, it } from "vitest";
import { toGoalActivity } from "../src/persistence/goal-activity.js";

describe("goal allocation history mapping", () => {
  const createdAt = new Date("2026-10-09T20:00:00.000Z");
  it("shows goal credits and debits without changing share units", () => {
    const result = toGoalActivity([
      { id: "one", eventId: "e1", eventKind: "TRANSFER", shareDeltaAtomic: "1234567", createdAt },
      { id: "two", eventId: "e2", eventKind: "TRANSFER", shareDeltaAtomic: "-345678", createdAt },
    ]);
    expect(result.map((item) => [item.kind, item.shareDeltaAtomic]))
      .toEqual([["ADDED", "1234567"], ["REMOVED", "-345678"]]);
  });
  it("does not misrepresent reconciliation or opening entries as user movements", () => {
    expect(toGoalActivity([
      { id: "one", eventId: "e1", eventKind: "OPENING", shareDeltaAtomic: "1000000", createdAt },
      { id: "two", eventId: "e2", eventKind: "RECONCILIATION_CREDIT", shareDeltaAtomic: "2000000", createdAt },
    ])).toEqual([]);
  });
});
