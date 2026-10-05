import {
  useCallback,
  useMemo,
  useState,
} from "react";
import type {
  Address,
} from "viem";

import type {
  KeptApi,
} from "@/api/kept-api";
import {
  readGoalFunding,
  type GoalFundingState,
} from "@/features/goals/funding";
import {
  consumerErrorMessage,
} from "@/lib/consumer-error";
import {
  diagnostics,
} from "@/lib/diagnostics";
import {
  createLatestRequestGate,
} from "@/lib/latest-request";

import {
  beginProductRefresh,
  failProductRefresh,
  initialProductDataState,
  type ProductDataState,
} from "./product-data-state";

interface ContractReader {
  readContract(
    input: unknown,
  ): Promise<bigint>;
}

interface UseProductDataControllerInput {
  readonly api:
    KeptApi | null;

  readonly account:
    Address | null;

  readonly vault:
    Address | null;

  readonly publicClient:
    ContractReader | null;
}

function fundingRefreshError(
  current: GoalFundingState,
  message: string,
): GoalFundingState {
  const funding =
    current.kind === "loading"
      ? undefined
      : current.funding;

  return funding
    ? {
        kind: "error",
        message,
        funding,
      }
    : {
        kind: "error",
        message,
      };
}

export function useProductDataController({
  api,
  account,
  vault,
  publicClient,
}: UseProductDataControllerInput): {
  readonly productState:
    ProductDataState;

  readonly goalFundingState:
    GoalFundingState;

  readonly refreshProductData:
    () => Promise<void>;
} {
  const [
    productState,
    setProductState,
  ] =
    useState<ProductDataState>(
      initialProductDataState,
    );

  const [
    goalFundingState,
    setGoalFundingState,
  ] =
    useState<GoalFundingState>({
      kind: "loading",
    });

  const requestGate =
    useMemo(
      () =>
        createLatestRequestGate(),
      [],
    );

  const refreshProductData =
    useCallback(
      async () => {
        const requestId =
          requestGate.begin();

        setProductState(
          beginProductRefresh,
        );

        setGoalFundingState(
          (current) =>
            current.kind === "ready"
              ? current
              : {
                  kind:
                    "loading",
                },
        );

        if (!api) {
          if (
            requestGate.isCurrent(
              requestId,
            )
          ) {
            setProductState(
              (current) =>
                failProductRefresh(
                  current,
                  "Kept's service is not configured.",
                ),
            );

            setGoalFundingState({
              kind: "error",
              message:
                "Goal balances are unavailable because Kept is not configured.",
            });
          }

          return;
        }

        try {
          const [
            goals,
            commitments,
          ] =
            await Promise.all([
              api.listGoals(),
              api.listCommitments(),
            ]);

          if (
            requestGate.isCurrent(
              requestId,
            )
          ) {
            setProductState({
              kind: "ready",
              goals,
              commitments,
            });
          }

          if (
            !vault
            || !publicClient
          ) {
            if (
              requestGate.isCurrent(
                requestId,
              )
            ) {
              setGoalFundingState({
                kind: "error",
                message:
                  "Goal balances are unavailable because Kept is not configured.",
              });
            }

            return;
          }

          try {
            if (!account) {
              if (
                requestGate.isCurrent(
                  requestId,
                )
              ) {
                setGoalFundingState({
                  kind: "error",
                  message:
                    "Your Kept account is not ready yet.",
                });
              }

              return;
            }

            const allocations =
              await Promise.all(
                goals.map(
                  (goal) =>
                    api.getGoalAllocation(
                      goal.id,
                    ),
                ),
              );

            const funding =
              await readGoalFunding({
                allocations,
                publicClient,
                vault,
              });

            if (
              requestGate.isCurrent(
                requestId,
              )
            ) {
              setGoalFundingState({
                kind: "ready",
                funding,
              });
            }
          } catch (error) {
            if (
              requestGate.isCurrent(
                requestId,
              )
            ) {
              diagnostics.warn(
                "api.goal_funding_refresh_failed",
                error,
              );

              setGoalFundingState(
                (current) =>
                  fundingRefreshError(
                    current,
                    consumerErrorMessage(
                      error,
                      "We could not reconcile your goal balances. Refresh before assigning more savings.",
                    ),
                  ),
              );
            }
          }
        } catch (error) {
          if (
            requestGate.isCurrent(
              requestId,
            )
          ) {
            diagnostics.error(
              "api.product_refresh_failed",
              error,
            );

            setProductState(
              (current) =>
                failProductRefresh(
                  current,
                  consumerErrorMessage(
                    error,
                    "We could not refresh your goals and commitments. Try again.",
                  ),
                ),
            );

            setGoalFundingState(
              (current) =>
                fundingRefreshError(
                  current,
                  "We could not refresh your goal balances. Try again.",
                ),
            );
          }
        }
      },
      [
        account,
        api,
        publicClient,
        requestGate,
        vault,
      ],
    );

  return {
    productState,
    goalFundingState,
    refreshProductData,
  };
}
