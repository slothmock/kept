import {
  useCallback,
  useEffect,
  useState,
} from "react";

import type {
  KeptApi,
} from "@/api/kept-api";
import type {
  SavingsMarketStatusState,
} from "@/features/savings/SavingsMarketStatus";
import {
  ConsumerError,
} from "@/lib/consumer-error";
import {
  diagnostics,
} from "@/lib/diagnostics";

export type SavingsPerformanceState =
  | {
      readonly kind:
        "unavailable";
    }
  | {
      readonly kind:
        "loading";
    }
  | {
      readonly kind:
        "ready";

      readonly earningsAssets:
        bigint;
    }
  | {
      readonly kind:
        "synchronizing";

      readonly progressPercent:
        number | null;
    }
  | {
      readonly kind:
        "error";
    };

interface UseSavingsStatusControllerInput {
  readonly api:
    KeptApi | null;

  readonly account:
    string | null;
}

export function useSavingsStatusController({
  api,
  account,
}: UseSavingsStatusControllerInput): {
  readonly savingsPerformanceState:
    SavingsPerformanceState;

  readonly savingsMarketStatusState:
    SavingsMarketStatusState;

  readonly refreshSavingsPerformance:
    () => Promise<void>;

  readonly refreshSavingsMarketStatus:
    () => Promise<void>;
} {
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

  const refreshSavingsPerformance =
    useCallback(
      async () => {
        if (!api || !account) {
          setSavingsPerformanceState({
            kind: "unavailable",
          });

          return;
        }

        setSavingsPerformanceState({
          kind: "loading",
        });

        try {
          const performance =
            await api
              .getSavingsPerformance();

          setSavingsPerformanceState({
            kind: "ready",
            earningsAssets:
              BigInt(
                performance
                  .earningsAssetsAtomic,
              ),
          });
        } catch (error) {
          if (
            error
              instanceof ConsumerError
            && error.code
              === "synchronizing"
          ) {
            setSavingsPerformanceState({
              kind:
                "synchronizing",
              progressPercent:
                error
                  .progressPercent
                ?? null,
            });

            return;
          }

          diagnostics.warn(
            "savings.performance_refresh_failed",
            error,
          );

          setSavingsPerformanceState({
            kind: "error",
          });
        }
      },
      [
        account,
        api,
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
            void refreshSavingsPerformance();
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
      refreshSavingsPerformance,
      savingsPerformanceState.kind,
    ],
  );

  const refreshSavingsMarketStatus =
    useCallback(
      async () => {
        if (!api || !account) {
          setSavingsMarketStatusState({
            kind: "unavailable",
          });

          return;
        }

        setSavingsMarketStatusState({
          kind: "loading",
        });

        try {
          const status =
            await api
              .getSavingsMarketStatus();

          setSavingsMarketStatusState({
            kind: "ready",

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
                status.grossApyBps,
              ),

            netApyBps:
              Number(
                status.netApyBps,
              ),
          });
        } catch (error) {
          diagnostics.warn(
            "savings.market_status_refresh_failed",
            error,
          );

          setSavingsMarketStatusState({
            kind: "error",
          });
        }
      },
      [
        account,
        api,
      ],
    );

  return {
    savingsPerformanceState,
    savingsMarketStatusState,
    refreshSavingsPerformance,
    refreshSavingsMarketStatus,
  };
}
