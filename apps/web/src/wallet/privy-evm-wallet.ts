import { useCallback, useEffect, useState } from "react";
import {
  useWallets,
  type EIP1193Provider,
} from "@privy-io/react-auth";

import { diagnostics } from "@/lib/diagnostics";
import { parseEvmChainId, parseProviderChainId } from "@/wallet/network-readiness-core";

export type EthereumProvider = EIP1193Provider;

interface WalletCandidate {
  readonly address: string;
  readonly chainId?: string;
  readonly type: "ethereum" | "solana";
  readonly walletClientType: string;
  getEthereumProvider?: () => Promise<EthereumProvider>;
}

export interface KeptEvmWallet {
  readonly isReady: boolean;
  readonly address: string | null;
  readonly chainId: number | null;
  readonly liveChainId: number | null;

  readonly getCurrentChainId:
  () => Promise<number | null>;

  readonly getProvider:
  () => Promise<EthereumProvider | null>;
}

export function observeProviderChainId(
  provider: EthereumProvider,
  onChainId: (chainId: number | null) => void,
  onError: (error: unknown) => void = () => undefined,
): () => void {
  let active = true;
  let receivedChainChanged = false;

  const handleChainChanged = (chainId: unknown) => {
    receivedChainChanged = true;

    if (active) {
      onChainId(
        parseProviderChainId(
          chainId,
        ),
      );
    }
  };

  provider.on?.(
    "chainChanged",
    handleChainChanged,
  );

  void provider
    .request({
      method: "eth_chainId",
    })
    .then((chainId) => {
      if (
        active &&
        !receivedChainChanged
      ) {
        onChainId(
          parseProviderChainId(
            chainId,
          ),
        );
      }
    })
    .catch((error) => {
      onError(error);

      if (
        active &&
        !receivedChainChanged
      ) {
        onChainId(null);
      }
    });

  return () => {
    active = false;

    provider.removeListener?.(
      "chainChanged",
      handleChainChanged,
    );
  };
}

export function selectPrivyEvmWallet<T extends WalletCandidate>(
  wallets: readonly T[],
): T | null {
  return wallets.find(
    (wallet) => wallet.type === "ethereum" && wallet.walletClientType === "privy",
  ) ?? null;
}

export function useKeptEvmWallet(): KeptEvmWallet {

  const { ready, wallets } = useWallets();
  const wallet = selectPrivyEvmWallet(wallets);
  const [observedChain, setObservedChain] = useState<{
    readonly wallet: WalletCandidate;
    readonly chainId: number | null;
  } | null>(null);

  const getProvider =
    useCallback(async () => {
      if (
        !wallet?.getEthereumProvider
      ) {
        return null;
      }

      try {
        return await wallet
          .getEthereumProvider();
      } catch (error) {
        diagnostics.error(
          "wallet.provider_unavailable",
          error,
        );

        return null;
      }
    }, [wallet]);

  useEffect(() => {
    if (!wallet?.getEthereumProvider) return;

    let disposed = false;
    let stopObserving: (() => void) | undefined;
    void wallet.getEthereumProvider().then((provider) => {
      if (disposed) return;
      stopObserving = observeProviderChainId(
        provider,
        (chainId) => setObservedChain({ wallet, chainId }),
        (error) => diagnostics.error("wallet.chain_observation_failed", error),
      );
    }).catch((error) => {
      diagnostics.error("wallet.provider_unavailable", error);
      if (!disposed) setObservedChain({ wallet, chainId: null });
    });

    return () => {
      disposed = true;
      stopObserving?.();
    };
  }, [wallet]);

  const getCurrentChainId = useCallback(async () => {
    if (!wallet?.getEthereumProvider) return null;

    try {
      const provider = await wallet.getEthereumProvider();
      return parseProviderChainId(await provider.request({ method: "eth_chainId" }));
    } catch (error) {
      diagnostics.error("wallet.chain_read_failed", error);
      return null;
    }
  }, [wallet]);

  return {
    isReady: ready,
    address:
      wallet?.address ?? null,

    chainId:
      parseEvmChainId(
        wallet?.chainId,
      ),

    liveChainId:
      observedChain?.wallet === wallet
        ? observedChain.chainId
        : null,

    getCurrentChainId,
    getProvider,
  };
}
