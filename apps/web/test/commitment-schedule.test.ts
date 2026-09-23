import { describe, expect, it } from "vitest";

import { commitmentSchedule } from "../src/features/commitments/commitment-schedule.js";

describe("commitmentSchedule", () => {
  it("starts far enough in the future for the transaction to be mined", () => {
    const now = new Date("2026-09-23T12:00:00.250Z");
    const schedule = commitmentSchedule(now);

    expect(schedule.startAt.toISOString()).toBe("2026-09-23T12:05:01.000Z");
    expect(schedule.endAt.getTime() - schedule.startAt.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(schedule.verificationDeadline.getTime() - schedule.endAt.getTime()).toBe(
      24 * 60 * 60 * 1000,
    );
  });
});
