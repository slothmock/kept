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

import { GoalDetailsDialog } from "../src/features/goals/GoalDetailsDialog.js";

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
    ...overrides,
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
        /Your savings remain in Kept/,
      ),
    ).toBeTruthy();

    expect(
      screen.getByText(
        /Any commitments connected to this goal will also be cancelled/,
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
        name: "Cancel",
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

    const cancelButton =
      screen.getByRole("button", {
        name: "Cancel",
      });

    const deleteButton =
      screen.getByRole("button", {
        name: "Deleting…",
      });

    expect(
      (
        cancelButton as HTMLButtonElement
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
});