import { useWallets } from "@privy-io/react-auth/solana";

export interface KeptWallet {
  readonly isReady: boolean;
  readonly address: string | null;
}

export function useKeptWallet(): KeptWallet {
  const { ready, wallets } = useWallets();

  const wallet = wallets[0] ?? null;

  return {
    isReady: ready,
    address: wallet?.address ?? null,
  };
}