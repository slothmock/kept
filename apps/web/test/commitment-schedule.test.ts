import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  commitmentSchedule,
} from "../src/features/commitments/commitment-schedule.js";

describe("commitmentSchedule", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("starts far enough in the future for the transaction to be mined", () => {
    vi.stubEnv(
      "VITE_ENABLE_LOCAL_ANVIL",
      "false",
    );

    const now =
      new Date(
        "2026-09-23T12:00:00.250Z",
      );

    const schedule =
      commitmentSchedule(now);

    expect(
      schedule.startAt.toISOString(),
    ).toBe(
      "2026-09-23T12:05:01.000Z",
    );

    expect(
      schedule.endAt.getTime()
      - schedule.startAt.getTime(),
    ).toBe(
      7
      * 24
      * 60
      * 60
      * 1000,
    );

    expect(
      schedule.verificationDeadline.getTime()
      - schedule.endAt.getTime(),
    ).toBe(
      24
      * 60
      * 60
      * 1000,
    );
  });

  it("uses the shortened commitment window on local Anvil", () => {
    vi.stubEnv(
      "VITE_ENABLE_LOCAL_ANVIL",
      "true",
    );

    vi.stubEnv(
      "VITE_DEV_COMMITMENT_WINDOW_SECONDS",
      "120",
    );

    const now =
      new Date(
        "2026-09-23T12:00:00.250Z",
      );

    const schedule =
      commitmentSchedule(now);

    expect(
      schedule.startAt.toISOString(),
    ).toBe(
      "2026-09-23T12:00:11.000Z",
    );

    expect(
      schedule.endAt.toISOString(),
    ).toBe(
      "2026-09-23T12:02:11.000Z",
    );

    expect(
      schedule.verificationDeadline.toISOString(),
    ).toBe(
      "2026-09-23T12:07:11.000Z",
    );
  });

  it("does not enable the dev override unless local Anvil is enabled", () => {
    vi.stubEnv(
      "VITE_ENABLE_LOCAL_ANVIL",
      "false",
    );

    vi.stubEnv(
      "VITE_DEV_COMMITMENT_WINDOW_SECONDS",
      "120",
    );

    const now =
      new Date(
        "2026-09-23T12:00:00.250Z",
      );

    const schedule =
      commitmentSchedule(now);

    expect(
      schedule.endAt.getTime()
      - schedule.startAt.getTime(),
    ).toBe(
      7
      * 24
      * 60
      * 60
      * 1000,
    );
  });

  it("falls back to the normal schedule when the dev window is invalid", () => {
    vi.stubEnv(
      "VITE_ENABLE_LOCAL_ANVIL",
      "true",
    );

    vi.stubEnv(
      "VITE_DEV_COMMITMENT_WINDOW_SECONDS",
      "invalid",
    );

    const now =
      new Date(
        "2026-09-23T12:00:00.250Z",
      );

    const schedule =
      commitmentSchedule(now);

    expect(
      schedule.startAt.toISOString(),
    ).toBe(
      "2026-09-23T12:05:01.000Z",
    );

    expect(
      schedule.endAt.getTime()
      - schedule.startAt.getTime(),
    ).toBe(
      7
      * 24
      * 60
      * 60
      * 1000,
    );
  });
});