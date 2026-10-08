// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  CommitmentDto,
  GoalDto,
} from "../src/api/kept-api.js";

import { GoalDetailsDialog } from "../src/features/goals/components/GoalDetailsDialog.js";

const goal: GoalDto = {
  id: "goal-1",
  userId: "user-1",
  name: "Laptop",
  targetAmountAtomic: "1000000000",
  targetAsset: "USDC",
  targetDate: null,
  status: "ACTIVE",
  createdAt: "2026-09-18T00:00:00.000Z",
  updatedAt: "2026-09-18T00:00:00.000Z",
};

const commitments: readonly CommitmentDto[] = [];

const completedCommitment: CommitmentDto = {
  id: "commitment-1",
  userId: "user-1",
  savingsGoalId: goal.id,
  definition: {
    code: "WEEKLY_SAVINGS_V1",
    version: 1,
  },
  parameters: {
    targetAmountAtomic: "50000000",
    periodDays: 7,
  },
  epochStart: "2026-09-18T00:00:00.000Z",
  epochEnd: "2026-09-25T00:00:00.000Z",
  verificationDeadline: "2026-09-26T00:00:00.000Z",
  state: "COMPLETED",
  stateVersion: 3,
  onchainCommitmentId: "1",
  createdAt: "2026-09-18T00:00:00.000Z",
  updatedAt: "2026-09-25T00:00:00.000Z",
  activatedAt: "2026-09-25T00:00:00.000Z",
  finalizedAt: "2026-09-25T00:00:00.000Z",
};

function renderDialog(
  overrides: Partial<
    ComponentProps<typeof GoalDetailsDialog>
  > = {},
) {
  const props: ComponentProps<
    typeof GoalDetailsDialog
  > = {
    open: true,
    goal,
    deleting: false,
    deleteStatus: null,
    deleteError: null,
    onDelete: vi.fn().mockResolvedValue(true),
    funding: {
      goalId: goal.id,
      allocatedShares: 100n,
      allocatedAssets: 100_000_000n,
      targetAssets: 1_000_000_000n,
    },
    commitments,
    onOpenChange: vi.fn(),
    onManageSavings: vi.fn(),
    onAddCommitment: vi.fn(),
    rewardStates: {},
    claimingRewardId: null,
    rewardClaimError: null,
    onClaimReward: vi.fn(),

    ...overrides,

    onAddToSavings:
      overrides.onAddToSavings ??
      vi.fn(),
  };

  const rendered = render(
    <GoalDetailsDialog {...props} />,
  );

  return {
    ...rendered,
    props,
  };
}

afterEach(() => {
  cleanup();
});

describe("GoalDetailsDialog", () => {
  it("shows delete confirmation before deleting", () => {
    renderDialog();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Delete goal",
      }),
    );

    expect(
      screen.getByText('Delete “Laptop”?'),
    ).toBeTruthy();

    expect(
      screen.getByText(
        /Your money stays in Kept/,
      ),
    ).toBeTruthy();

    expect(
      screen.getByText(
        /Connected commitments will also be cancelled/,
      ),
    ).toBeTruthy();
  });

  it("allows the delete confirmation to be cancelled", () => {
    renderDialog();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Delete goal",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Keep goal",
      }),
    );

    expect(
      screen.queryByText('Delete “Laptop”?'),
    ).toBeNull();
  });

  it("deletes the goal and closes the dialog when deletion succeeds", async () => {
    const onDelete = vi
      .fn()
      .mockResolvedValue(true);

    const onOpenChange = vi.fn();

    renderDialog({
      onDelete,
      onOpenChange,
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Delete goal",
      }),
    );

    const buttons =
      screen.getAllByRole("button", {
        name: "Delete goal",
      });

    fireEvent.click(
      buttons[buttons.length - 1]!,
    );

    await waitFor(() => {
      expect(
        onDelete,
      ).toHaveBeenCalledWith(goal);
    });

    expect(
      onOpenChange,
    ).toHaveBeenCalledWith(false);
  });

  it("keeps the dialog open when deletion fails", async () => {
    const onDelete = vi
      .fn()
      .mockResolvedValue(false);

    const onOpenChange = vi.fn();

    renderDialog({
      onDelete,
      onOpenChange,
      deleteError:
        "We could not delete this goal.",
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Delete goal",
      }),
    );

    const buttons =
      screen.getAllByRole("button", {
        name: "Delete goal",
      });

    fireEvent.click(
      buttons[buttons.length - 1]!,
    );

    await waitFor(() => {
      expect(
        onDelete,
      ).toHaveBeenCalledWith(goal);
    });

    expect(
      onOpenChange,
    ).not.toHaveBeenCalledWith(false);

    expect(
      screen.getByText(
        "We could not delete this goal.",
      ),
    ).toBeTruthy();

    expect(
      screen.getByText('Delete “Laptop”?'),
    ).toBeTruthy();
  });

  it("disables delete controls while deletion is in progress", () => {
    renderDialog({
      deleting: true,
      deleteStatus:
        "Cancelling your commitment…",
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Delete goal",
      }),
    );

    const keepGoalButton =
      screen.getByRole("button", {
        name: "Keep goal",
      });

    const deleteButton =
      screen.getByRole("button", {
        name: "Deleting…",
      });

    expect(
      (
        keepGoalButton as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    expect(
      (
        deleteButton as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    expect(
      screen.getByText(
        "Cancelling your commitment…",
      ),
    ).toBeTruthy();
  });

  it("shows an available reward for a completed commitment", () => {
    renderDialog({
      commitments: [completedCommitment],
      rewardStates: {
        [completedCommitment.id]: {
          kind: "ready",
          reward: {
            owner:
              "0x2222222222222222222222222222222222222222",
            rewardAssets: 5_000_000n,
            rewardClaimed: false,
            status: 2,
          },
        },
      },
    });

    expect(
      screen.getByText(
        "5.00 USDC reward",
      ),
    ).toBeTruthy();

    expect(
      screen.getByText(
        "Your commitment has been verified.",
      ),
    ).toBeTruthy();

    expect(
      screen.getByRole("button", {
        name: "Claim reward",
      }),
    ).toBeTruthy();
  });

  it("shows a claimed reward for a completed commitment", () => {
    renderDialog({
      commitments: [completedCommitment],
      rewardStates: {
        [completedCommitment.id]: {
          kind: "ready",
          reward: {
            owner:
              "0x2222222222222222222222222222222222222222",
            rewardAssets: 5_000_000n,
            rewardClaimed: true,
            status: 2,
          },
        },
      },
    });

    expect(
      screen.getByText(
        "Reward claimed",
      ),
    ).toBeTruthy();

    expect(
      screen.getByText(
        "5.00 USDC was added to your available cash.",
      ),
    ).toBeTruthy();

    expect(
      screen.queryByRole("button", {
        name: "Claim reward",
      }),
    ).toBeNull();

    expect(
      screen.getByRole("button", {
        name: "Add to savings",
      }),
    ).toBeTruthy();
  });

  it("claims an available reward", () => {
    const onClaimReward = vi
      .fn()
      .mockResolvedValue(true);

    renderDialog({
      commitments: [completedCommitment],
      rewardStates: {
        [completedCommitment.id]: {
          kind: "ready",
          reward: {
            owner:
              "0x2222222222222222222222222222222222222222",
            rewardAssets: 5_000_000n,
            rewardClaimed: false,
            status: 2,
          },
        },
      },
      onClaimReward,
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Claim reward",
      }),
    );

    expect(
      onClaimReward,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        id: completedCommitment.id,
      }),
    );
  });
});