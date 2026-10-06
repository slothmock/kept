import {
  useCallback,
  useRef,
  useState,
} from "react";
import type {
  Address,
} from "viem";

import type {
  GoalDto,
  KeptApi,
} from "@/api/kept-api";
import {
  allocationInputError,
  deallocationInputError,
  previewAllocationShares,
  type GoalFundingState,
} from "@/features/goals/funding";
import {
  consumerErrorMessage,
} from "@/lib/consumer-error";
import {
  diagnostics,
} from "@/lib/diagnostics";
import {
  parseUsdcDepositAmount,
} from "@/features/savings/vault/deposit-input";

interface UseGoalAllocationControllerInput {
  readonly api:
    KeptApi | null;

  readonly vault:
    Address | null;

  readonly goalFundingState:
    GoalFundingState;

  readonly readContract:
    ((
      input: unknown,
    ) => Promise<bigint>)
    | null;

  readonly refreshProductData:
    () => Promise<void>;
}

type GoalAllocationDirection =
  "fund"
  | "unfund";

export function useGoalAllocationController({
  api,
  vault,
  goalFundingState,
  readContract,
  refreshProductData,
}: UseGoalAllocationControllerInput): {
  readonly allocatingGoal:
    boolean;

  readonly allocationStatus:
    string | null;

  readonly allocationError:
    string | null;

  readonly addToGoal:
    (
      goal:
        GoalDto,
      amount:
        string,
    ) => Promise<boolean>;

  readonly removeFromGoal:
    (
      goal:
        GoalDto,
      amount:
        string,
    ) => Promise<boolean>;

  readonly moveBetweenGoals:
    (
      fromGoal:
        GoalDto,
      toGoal:
        GoalDto,
      amount:
        string,
    ) => Promise<boolean>;

  readonly dismissAllocation:
    () => void;
} {
  const [
    allocatingGoal,
    setAllocatingGoal,
  ] =
    useState(
      false,
    );

  const [
    allocationStatus,
    setAllocationStatus,
  ] =
    useState<
      string | null
    >(null);

  const [
    allocationError,
    setAllocationError,
  ] =
    useState<
      string | null
    >(null);

  const allocationPending =
    useRef(
      false,
    );

  const changeGoalAllocation =
    useCallback(
      async (
        goal:
          GoalDto,
        amount:
          string,
        direction:
          GoalAllocationDirection,
      ): Promise<boolean> => {
        if (
          allocationPending
            .current
        ) {
          setAllocationError(
            "An allocation request is already in progress.",
          );

          return false;
        }

        if (
          !api
          || !vault
          || !readContract
          || goalFundingState.kind
            !== "ready"
        ) {
          setAllocationError(
            "Your goal balances are not ready yet. Refresh and try again.",
          );

          return false;
        }

        const parsed =
          parseUsdcDepositAmount(
            amount,
          );

        if (
          "error" in parsed
          || parsed.assets
            <= 0n
        ) {
          setAllocationError(
            "Enter a valid amount greater than zero.",
          );

          return false;
        }

        const goalFunding =
          goalFundingState
            .funding
            .byGoal
            .get(
              goal.id,
            );

        if (
          !goalFunding
        ) {
          setAllocationError(
            "This goal balance is not available.",
          );

          return false;
        }

        allocationPending.current =
          true;

        setAllocatingGoal(
          true,
        );

        setAllocationError(
          null,
        );

        try {
          const requiredShares =
            await previewAllocationShares({
              assets:
                parsed.assets,
              publicClient: {
                readContract,
              },
              vault,
            });

          const validationError =
            direction
              === "fund"
              ? allocationInputError(
                  parsed.assets,
                  requiredShares,
                  goalFundingState
                    .funding
                    .unallocatedShares,
                )
              : deallocationInputError(
                  parsed.assets,
                  requiredShares,
                  goalFunding
                    .allocatedShares,
                );

          if (
            validationError
          ) {
            setAllocationError(
              validationError,
            );

            return false;
          }

          setAllocationStatus(
            direction
              === "fund"
              ? "Adding savings to your goal…"
              : "Moving savings out of your goal…",
          );

          await api.allocateGoalShares(
            goal.id,
            {
              shareDeltaAtomic:
                direction
                  === "fund"
                  ? requiredShares
                      .toString()
                  : (
                      -requiredShares
                    )
                      .toString(),
              reason:
                "manual",
            },
            globalThis.crypto
              .randomUUID(),
          );

          await refreshProductData();

          setAllocationStatus(
            null,
          );

          return true;
        } catch (
          error
        ) {
          diagnostics.error(
            direction
              === "fund"
              ? "api.goal_allocation_failed"
              : "api.goal_deallocation_failed",
            error,
          );

          setAllocationStatus(
            null,
          );

          setAllocationError(
            consumerErrorMessage(
              error,
              direction
                === "fund"
                ? "We could not add those savings to your goal. Refresh and try again."
                : "We could not move those savings out of your goal. Refresh and try again.",
            ),
          );

          return false;
        } finally {
          allocationPending.current =
            false;

          setAllocatingGoal(
            false,
          );
        }
      },
      [
        api,
        goalFundingState,
        readContract,
        refreshProductData,
        vault,
      ],
    );

  const addToGoal =
    useCallback(
      (
        goal:
          GoalDto,
        amount:
          string,
      ) =>
        changeGoalAllocation(
          goal,
          amount,
          "fund",
        ),
      [
        changeGoalAllocation,
      ],
    );

  const removeFromGoal =
    useCallback(
      (
        goal:
          GoalDto,
        amount:
          string,
      ) =>
        changeGoalAllocation(
          goal,
          amount,
          "unfund",
        ),
      [
        changeGoalAllocation,
      ],
    );

  const moveBetweenGoals =
    useCallback(
      async (
        fromGoal:
          GoalDto,
        toGoal:
          GoalDto,
        amount:
          string,
      ): Promise<boolean> => {
        if (
          allocationPending
            .current
        ) {
          setAllocationError(
            "A savings change is already in progress.",
          );

          return false;
        }

        if (
          !api
          || !vault
          || !readContract
          || goalFundingState.kind
            !== "ready"
        ) {
          setAllocationError(
            "Your goal balances are not ready yet. Refresh and try again.",
          );

          return false;
        }

        if (
          fromGoal.id
          === toGoal.id
        ) {
          setAllocationError(
            "Choose a different goal.",
          );

          return false;
        }

        const parsed =
          parseUsdcDepositAmount(
            amount,
          );

        if (
          "error" in parsed
          || parsed.assets
            <= 0n
        ) {
          setAllocationError(
            "Enter a valid amount greater than zero.",
          );

          return false;
        }

        const sourceFunding =
          goalFundingState
            .funding
            .byGoal
            .get(
              fromGoal.id,
            );

        if (
          !sourceFunding
        ) {
          setAllocationError(
            "This goal balance is not available.",
          );

          return false;
        }

        allocationPending.current =
          true;

        setAllocatingGoal(
          true,
        );

        setAllocationError(
          null,
        );

        try {
          const shares =
            await previewAllocationShares({
              assets:
                parsed.assets,
              publicClient: {
                readContract,
              },
              vault,
            });

          const validationError =
            deallocationInputError(
              parsed.assets,
              shares,
              sourceFunding
                .allocatedShares,
            );

          if (
            validationError
          ) {
            setAllocationStatus(
              null,
            );

            setAllocationError(
              validationError,
            );

            return false;
          }

          setAllocationStatus(
            "Moving savings…",
          );

          await api.reallocateGoalShares(
            {
              fromGoalId:
                fromGoal.id,
              toGoalId:
                toGoal.id,
              shareAmountAtomic:
                shares
                  .toString(),
            },
            globalThis.crypto
              .randomUUID(),
          );

          await refreshProductData();

          setAllocationStatus(
            null,
          );

          return true;
        } catch (
          error
        ) {
          diagnostics.error(
            "api.goal_reallocation_failed",
            error,
          );

          setAllocationStatus(
            null,
          );

          setAllocationError(
            consumerErrorMessage(
              error,
              "We could not move those savings. Refresh and try again.",
            ),
          );

          return false;
        } finally {
          allocationPending.current =
            false;

          setAllocatingGoal(
            false,
          );
        }
      },
      [
        api,
        goalFundingState,
        readContract,
        refreshProductData,
        vault,
      ],
    );

  const dismissAllocation =
    useCallback(
      () => {
        setAllocationError(
          null,
        );

        setAllocationStatus(
          null,
        );
      },
      [],
    );

  return {
    allocatingGoal,
    allocationStatus,
    allocationError,
    addToGoal,
    removeFromGoal,
    moveBetweenGoals,
    dismissAllocation,
  };
}
