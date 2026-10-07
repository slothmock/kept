import {
  useCallback,
  useState,
} from "react";
import type {
  Address,
} from "viem";

import type {
  KeptApi,
} from "@/api/kept-api";
import {
  consumerErrorMessage,
} from "@/lib/consumer-error";
import {
  diagnostics,
} from "@/lib/diagnostics";

interface UseStagingFaucetControllerInput {
  readonly api:
    KeptApi | null;

  readonly account:
    Address | null;

  readonly chainId:
    number | null;

  readonly refreshPosition:
    () => Promise<void>;
}

export function useStagingFaucetController({
  api,
  account,
  chainId,
  refreshPosition,
}: UseStagingFaucetControllerInput): {
  readonly available:
    boolean;

  readonly claiming:
    boolean;

  readonly status:
    string | null;

  readonly error:
    string | null;

  readonly claim:
    () => Promise<void>;
} {
  const [
    claiming,
    setClaiming,
  ] =
    useState(false);

  const [
    status,
    setStatus,
  ] =
    useState<
      string | null
    >(null);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  const available =
    chainId === 10_143;

  const claim =
    useCallback(
      async () => {
        if (
          !api
          || !account
          || !available
        ) {
          setError(
            "Test funds are unavailable right now.",
          );

          return;
        }

        setClaiming(
          true,
        );

        setStatus(
          "Adding test funds to your Kept wallet…",
        );

        setError(
          null,
        );

        try {
          const result =
            await api
              .claimStagingFaucet();

          setStatus(
            `Added ${
              (
                BigInt(
                  result.amountAtomic,
                )
                / 1_000_000n
              ).toString()
            } test USDC.`,
          );

          await refreshPosition();
        } catch (
          claimError
        ) {
          diagnostics.error(
            "staging.faucet_claim_failed",
            claimError,
          );

          setStatus(
            null,
          );

          setError(
            consumerErrorMessage(
              claimError,
              "We could not add test funds. Try again.",
            ),
          );
        } finally {
          setClaiming(
            false,
          );
        }
      },
      [
        account,
        api,
        available,
        refreshPosition,
      ],
    );

  return {
    available,
    claiming,
    status,
    error,
    claim,
  };
}
