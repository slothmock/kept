import {
  useCallback,
  useMemo,
  useState,
} from "react";
import type {
  Address,
} from "viem";

import type {
  ChainIdReader,
  ContractReader,
} from "@/wallet/blockchain";
import {
  checkNetworkReadiness,
} from "@/wallet/network-readiness-core";
import {
  currentPositionState,
  type BoundPositionState,
} from "@/features/savings/position-context";
import type {
  PositionState,
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
import type {
  VaultConfig,
} from "@/features/savings/vault/config";
import {
  readVaultPosition,
} from "@/features/savings/vault/position";

interface UseSavingsPositionControllerInput {
  readonly account:
    Address | null;

  readonly liveWalletChainId:
    number | null;

  readonly config:
    VaultConfig | null;

  readonly publicClient:
    (ContractReader & ChainIdReader) | null;

  readonly getCurrentWalletChainId:
    () => Promise<number | null>;
}

export function useSavingsPositionController({
  account,
  liveWalletChainId,
  config,
  publicClient,
  getCurrentWalletChainId,
}: UseSavingsPositionControllerInput): {
  readonly positionState:
    PositionState;

  readonly refreshPosition:
    () => Promise<void>;
} {
  const [
    storedPositionState,
    setStoredPositionState,
  ] =
    useState<BoundPositionState>({
      kind: "unavailable",
    });

  const requestGate =
    useMemo(
      () =>
        createLatestRequestGate(),
      [],
    );

  const positionState =
    currentPositionState(
      storedPositionState,
      {
        account,
        chainId:
          liveWalletChainId,
      },
    );

  const refreshPosition =
    useCallback(
      async () => {
        const requestId =
          requestGate.begin();

        if (
          !config
          || !publicClient
        ) {
          if (
            requestGate.isCurrent(
              requestId,
            )
          ) {
            setStoredPositionState({
              kind: "error",
              message:
                "Savings are unavailable because Kept is not configured.",
            });
          }

          return;
        }

        if (
          !account
        ) {
          if (
            requestGate.isCurrent(
              requestId,
            )
          ) {
            setStoredPositionState({
              kind:
                "unavailable",
            });
          }

          return;
        }

        setStoredPositionState({
          kind:
            "loading",
        });

        try {
          const walletChainId =
            await getCurrentWalletChainId();

          if (
            liveWalletChainId
              === null
            || liveWalletChainId
              !== walletChainId
          ) {
            if (
              requestGate.isCurrent(
                requestId,
              )
            ) {
              setStoredPositionState({
                kind: "error",
                message:
                  "Your Kept account is getting ready. Try again in a moment.",
              });
            }

            return;
          }

          const network =
            await checkNetworkReadiness({
              expectedChainId:
                config.chainId,
              walletChainId,
              rpc:
                publicClient,
            });

          if (
            !network.ready
          ) {
            if (
              requestGate.isCurrent(
                requestId,
              )
            ) {
              diagnostics.warn(
                "wallet.network_not_ready",
                network.diagnostic,
              );

              setStoredPositionState({
                kind: "error",
                message:
                  network.message,
              });
            }

            return;
          }

          const position =
            await readVaultPosition({
              publicClient,
              usdc:
                config.usdc,
              vault:
                config.vault,
              account,
            });

          if (
            requestGate.isCurrent(
              requestId,
            )
          ) {
            setStoredPositionState({
              kind:
                "ready",
              account,
              chainId:
                config.chainId,
              position,
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
            diagnostics.error(
              "vault.position_refresh_failed",
              error,
            );

            setStoredPositionState({
              kind: "error",
              message:
                consumerErrorMessage(
                  error,
                  "We could not refresh your savings. Try again.",
                ),
            });
          }
        }
      },
      [
        account,
        config,
        getCurrentWalletChainId,
        liveWalletChainId,
        publicClient,
        requestGate,
      ],
    );

  return {
    positionState,
    refreshPosition,
  };
}
