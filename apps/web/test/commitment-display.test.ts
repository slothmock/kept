import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  CommitmentDto,
} from "../src/api/kept-api.js";
import {
  commitmentTitle,
} from "../src/features/commitments/display.js";

function weeklySavingsCommitment(
  targetAmountAtomic: string,
): CommitmentDto {
  return {
    id: "commitment-1",
    userId: "user-1",
    savingsGoalId: "goal-1",
    definition: {
      code: "WEEKLY_SAVINGS_V1",
      version: 1,
    },
    parameters: {
      targetAmountAtomic,
      periodDays: 7,
    },
    epochStart: "2026-10-01T00:00:00.000Z",
    epochEnd: "2026-10-08T00:00:00.000Z",
    verificationDeadline: "2026-10-09T00:00:00.000Z",
    state: "ACTIVE",
    stateVersion: 2,
    onchainCommitmentId: "7",
    activatedAt: "2026-10-01T00:00:00.000Z",
    finalizedAt: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
}

describe(
  "commitment display",
  () => {
    it(
      "describes weekly savings as money added to savings this week",
      () => {
        expect(
          commitmentTitle(
            weeklySavingsCommitment(
              "15000000",
            ),
          ),
        ).toBe(
          "Add 15 USDC to savings this week",
        );
      },
    );
  },
);
