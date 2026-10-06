import {
  useCallback,
  useState,
} from "react";

import type {
  KeptApi,
} from "@/api/kept-api";
import {
  consumerErrorMessage,
} from "@/lib/consumer-error";
import {
  diagnostics,
} from "@/lib/diagnostics";
import {
  parseUsdcDepositAmount,
} from "@/features/savings/vault/deposit-input";

export interface CreateGoalInput {
  readonly name:
    string;

  readonly targetAmount:
    string;

  readonly targetDate:
    string | null;
}

interface UseGoalCreationControllerInput {
  readonly api:
    KeptApi | null;

  readonly refreshProductData:
    () => Promise<void>;
}

export function useGoalCreationController({
  api,
  refreshProductData,
}: UseGoalCreationControllerInput): {
  readonly creatingGoal:
    boolean;

  readonly goalError:
    string | null;

  readonly createGoal:
    (
      input:
        CreateGoalInput,
    ) => Promise<boolean>;

  readonly dismissGoal:
    () => void;
} {
  const [
    creatingGoal,
    setCreatingGoal,
  ] =
    useState(
      false,
    );

  const [
    goalError,
    setGoalError,
  ] =
    useState<
      string | null
    >(null);

  const createGoal =
    useCallback(
      async (
        input:
          CreateGoalInput,
      ): Promise<boolean> => {
        if (
          !api
        ) {
          setGoalError(
            "Kept's service is not configured.",
          );

          return false;
        }

        const name =
          input.name.trim();

        if (
          !name
        ) {
          setGoalError(
            "Give your goal a name.",
          );

          return false;
        }

        const parsed =
          parseUsdcDepositAmount(
            input.targetAmount,
          );

        if (
          "error" in parsed
          || parsed.assets
            <= 0n
        ) {
          setGoalError(
            "Enter a valid target amount greater than zero.",
          );

          return false;
        }

        setCreatingGoal(
          true,
        );

        setGoalError(
          null,
        );

        try {
          await api.createGoal({
            name,
            targetAmountAtomic:
              parsed.assets
                .toString(),
            targetDate:
              input.targetDate,
          });

          await refreshProductData();

          return true;
        } catch (
          error
        ) {
          diagnostics.error(
            "api.goal_create_failed",
            error,
          );

          setGoalError(
            consumerErrorMessage(
              error,
              "We could not create your goal. Try again.",
            ),
          );

          return false;
        } finally {
          setCreatingGoal(
            false,
          );
        }
      },
      [
        api,
        refreshProductData,
      ],
    );

  const dismissGoal =
    useCallback(
      () => {
        setGoalError(
          null,
        );
      },
      [],
    );

  return {
    creatingGoal,
    goalError,
    createGoal,
    dismissGoal,
  };
}
