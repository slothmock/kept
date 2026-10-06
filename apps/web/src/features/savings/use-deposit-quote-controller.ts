import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  Address,
} from "viem";

import {
  currentDepositQuote,
  type DepositQuoteState,
} from "@/features/savings/deposit-quote";
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
  minimumUsdcDepositError,
  parseUsdcDepositAmount,
} from "@/vault/deposit-input";
import {
  readVaultDepositQuote,
} from "@/vault/fees";

interface ContractReader {
  readContract(
    input: unknown,
  ): Promise<unknown>;
}

interface UseDepositQuoteControllerInput {
  readonly amount:
    string;

  readonly vault:
    Address | null;

  readonly publicClient:
    ContractReader | null;

  readonly positionReady:
    boolean;
}

export function useDepositQuoteController({
  amount,
  vault,
  publicClient,
  positionReady,
}: UseDepositQuoteControllerInput): {
  readonly depositQuoteState:
    DepositQuoteState;
} {
  const [
    storedDepositQuote,
    setStoredDepositQuote,
  ] =
    useState<DepositQuoteState>({
      kind: "idle",
    });

  const requestGate =
    useMemo(
      () =>
        createLatestRequestGate(),
      [],
    );

  const depositQuoteState =
    currentDepositQuote(
      storedDepositQuote,
      amount,
    );

  useEffect(
    () => {
      const requestId =
        requestGate.begin();

      const parsedAmount =
        parseUsdcDepositAmount(
          amount,
        );

      if (
        "error" in parsedAmount
        || minimumUsdcDepositError(
          parsedAmount.assets,
        )
        || !vault
        || !publicClient
        || !positionReady
      ) {
        queueMicrotask(
          () => {
            if (
              requestGate.isCurrent(
                requestId,
              )
            ) {
              setStoredDepositQuote({
                kind:
                  "idle",
              });
            }
          },
        );

        return;
      }

      queueMicrotask(
        () => {
          if (
            requestGate.isCurrent(
              requestId,
            )
          ) {
            setStoredDepositQuote({
              kind:
                "loading",
            });
          }
        },
      );

      void readVaultDepositQuote({
        assets:
          parsedAmount.assets,
        vault,
        publicClient,
      })
        .then(
          (
            quote,
          ) => {
            if (
              requestGate.isCurrent(
                requestId,
              )
            ) {
              setStoredDepositQuote({
                kind:
                  "ready",
                quote,
              });
            }
          },
        )
        .catch(
          (
            error,
          ) => {
            if (
              requestGate.isCurrent(
                requestId,
              )
            ) {
              diagnostics.error(
                "vault.deposit_quote_failed",
                error,
              );

              setStoredDepositQuote({
                kind:
                  "error",
                assets:
                  parsedAmount.assets,
                message:
                  consumerErrorMessage(
                    error,
                    "We could not calculate the fees. Try again.",
                  ),
              });
            }
          },
        );
    },
    [
      amount,
      positionReady,
      publicClient,
      requestGate,
      vault,
    ],
  );

  return {
    depositQuoteState,
  };
}
