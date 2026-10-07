import {
  useCallback,
  useEffect,
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
import type {
  SavingsMarketStatusState,
  SavingsPerformanceState,
} from "@/features/savings/state";
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

interface UseDashboardDataControllerInput {
  readonly api:
    KeptApi | null;

  readonly enabled:
    boolean;

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

export function useDashboardDataController({
  api,
  enabled,
  vault,
  publicClient,
}: UseDashboardDataControllerInput): {
  readonly productState:
    ProductDataState;

  readonly goalFundingState:
    GoalFundingState;

  readonly savingsPerformanceState:
    SavingsPerformanceState;

  readonly savingsMarketStatusState:
    SavingsMarketStatusState;

  readonly refreshDashboardData:
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

  const [
    savingsPerformanceState,
    setSavingsPerformanceState,
  ] =
    useState<SavingsPerformanceState>({
      kind: "unavailable",
    });

  const [
    savingsMarketStatusState,
    setSavingsMarketStatusState,
  ] =
    useState<SavingsMarketStatusState>({
      kind: "unavailable",
    });

  const requestGate =
    useMemo(
      () =>
        createLatestRequestGate(),
      [],
    );

  const refreshDashboardData =
    useCallback(
      async () => {
        if (
          !api
          || !enabled
        ) {
          return;
        }

        const requestId =
          requestGate.begin();

        setProductState(
          beginProductRefresh,
        );

        setGoalFundingState(
          (
            current,
          ) =>
            current.kind === "ready"
              ? current
              : {
                  kind:
                    "loading",
                },
        );

        setSavingsPerformanceState({
          kind:
            "loading",
        });

        setSavingsMarketStatusState({
          kind:
            "loading",
        });

        try {
          const dashboard =
            await api.getDashboard();

          if (
            !requestGate.isCurrent(
              requestId,
            )
          ) {
            return;
          }

          setProductState({
            kind:
              "ready",
            goals:
              dashboard.goals,
            commitments:
              dashboard.commitments,
          });

          const performance =
            dashboard.savings
              .performance;

          if (
            performance.kind
              === "ready"
          ) {
            setSavingsPerformanceState({
              kind:
                "ready",
              earningsAssets:
                BigInt(
                  performance.data
                    .earningsAssetsAtomic,
                ),
            });
          } else if (
            performance.kind
              === "synchronizing"
          ) {
            setSavingsPerformanceState({
              kind:
                "synchronizing",
              progressPercent:
                performance
                  .progressPercent,
            });
          } else {
            setSavingsPerformanceState({
              kind:
                "error",
            });
          }

          const marketStatus =
            dashboard.savings
              .marketStatus;

          if (
            marketStatus.kind
              === "ready"
          ) {
            const status =
              marketStatus.data;

            setSavingsMarketStatusState({
              kind:
                "ready",

              suppliedAssets:
                status
                  .suppliedAssetsAtomic
                  === null
                  ? null
                  : BigInt(
                      status
                        .suppliedAssetsAtomic,
                    ),

              supplyCapAssets:
                status
                  .supplyCapAssetsAtomic
                  === null
                  ? null
                  : BigInt(
                      status
                        .supplyCapAssetsAtomic,
                    ),

              availableToDepositAssets:
                status
                  .availableToDepositAtomic
                  === null
                  ? null
                  : BigInt(
                      status
                        .availableToDepositAtomic,
                    ),

              availableToWithdrawAssets:
                BigInt(
                  status
                    .availableToWithdrawAtomic,
                ),

              tvlAssets:
                BigInt(
                  status
                    .tvlAssetsAtomic,
                ),

              grossApyBps:
                Number(
                  status
                    .grossApyBps,
                ),

              netApyBps:
                Number(
                  status
                    .netApyBps,
                ),
            });
          } else {
            setSavingsMarketStatusState({
              kind:
                "error",
            });
          }

          if (
            !vault
            || !publicClient
          ) {
            setGoalFundingState({
              kind:
                "error",
              message:
                "Goal balances are unavailable because Kept is not configured.",
            });

            return;
          }

          try {
            const funding =
              await readGoalFunding({
                allocations:
                  Object.values(
                    dashboard
                      .allocations,
                  ),
                publicClient,
                vault,
              });

            if (
              requestGate.isCurrent(
                requestId,
              )
            ) {
              setGoalFundingState({
                kind:
                  "ready",
                funding,
              });
            }
          } catch (
            error
          ) {
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
                (
                  current,
                ) =>
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
        } catch (
          error
        ) {
          if (
            !requestGate.isCurrent(
              requestId,
            )
          ) {
            return;
          }

          diagnostics.error(
            "api.dashboard_refresh_failed",
            error,
          );

          setProductState(
            (
              current,
            ) =>
              failProductRefresh(
                current,
                consumerErrorMessage(
                  error,
                  "We could not refresh your dashboard. Try again.",
                ),
              ),
          );

          setGoalFundingState(
            (
              current,
            ) =>
              fundingRefreshError(
                current,
                "We could not refresh your goal balances. Try again.",
              ),
          );

          setSavingsPerformanceState({
            kind:
              "error",
          });

          setSavingsMarketStatusState({
            kind:
              "error",
          });
        }
      },
      [
        api,
        enabled,
        publicClient,
        requestGate,
        vault,
      ],
    );

  useEffect(
    () => {
      if (
        savingsPerformanceState
          .kind
        !== "synchronizing"
      ) {
        return;
      }

      const timeout =
        globalThis.setTimeout(
          () => {
            void refreshDashboardData();
          },
          10_000,
        );

      return () => {
        globalThis.clearTimeout(
          timeout,
        );
      };
    },
    [
      refreshDashboardData,
      savingsPerformanceState.kind,
    ],
  );

  return {
    productState,
    goalFundingState,
    savingsPerformanceState,
    savingsMarketStatusState,
    refreshDashboardData,
  };
}
