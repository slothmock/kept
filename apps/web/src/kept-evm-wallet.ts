import { useWallets } from "@privy-io/react-auth";

interface WalletCandidate {
  readonly address: string;
  readonly type: "ethereum" | "solana";
  readonly walletClientType: string;
}

export interface KeptEvmWallet {
  readonly isReady: boolean;
  readonly address: string | null;
}

export function selectKeptEvmWallet<T extends WalletCandidate>(
  wallets: readonly T[],
): T | null {
  return wallets.find(
    (wallet) => wallet.type === "ethereum" && wallet.walletClientType === "privy",
  ) ?? null;
}

export function useKeptEvmWallet(): KeptEvmWallet {
  const { ready, wallets } = useWallets();
  const wallet = selectKeptEvmWallet(wallets);

  return {
    isReady: ready,
    address: wallet?.address ?? null,
  };
}
