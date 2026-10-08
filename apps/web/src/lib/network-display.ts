interface NetworkDisplay {
  readonly name: string;
  readonly explorerUrl?: string;
}

const NETWORKS: Readonly<Record<string, NetworkDisplay>> = {
  "1": { name: "Ethereum", explorerUrl: "https://etherscan.io" },
  "10": { name: "Optimism", explorerUrl: "https://optimistic.etherscan.io" },
  "143": { name: "Monad", explorerUrl: "https://monadscan.com" },
  "8453": { name: "Base", explorerUrl: "https://basescan.org" },
  "10143": { name: "Monad Testnet", explorerUrl: "https://testnet.monadscan.com" },
  "31337": { name: "Kept Local Anvil" },
  "42161": { name: "Arbitrum", explorerUrl: "https://arbiscan.io" },
  ethereum: { name: "Ethereum", explorerUrl: "https://etherscan.io" },
  optimism: { name: "Optimism", explorerUrl: "https://optimistic.etherscan.io" },
  base: { name: "Base", explorerUrl: "https://basescan.org" },
  arbitrum: { name: "Arbitrum", explorerUrl: "https://arbiscan.io" },
  monad: { name: "Monad", explorerUrl: "https://monadscan.com" },
  "monad-testnet": { name: "Monad Testnet", explorerUrl: "https://testnet.monadscan.com" },
  solana: { name: "Solana", explorerUrl: "https://solscan.io" },
  "solana-mainnet": { name: "Solana", explorerUrl: "https://solscan.io" },
  "solana-devnet": { name: "Solana Devnet", explorerUrl: "https://solscan.io" },
};

function normalizedNetworkKey(chainId: string): string {
  return chainId.trim().toLowerCase();
}

export function networkName(chainId: string | null): string | null {
  if (!chainId?.trim()) {
    return null;
  }

  const key = normalizedNetworkKey(chainId);
  return NETWORKS[key]?.name ?? `Network ${chainId.trim()}`;
}

export function transactionExplorerUrl(
  chainId: string | null,
  transactionHash: string | null,
): string | null {
  if (!chainId?.trim() || !transactionHash?.trim()) {
    return null;
  }

  const key = normalizedNetworkKey(chainId);
  const explorerUrl = NETWORKS[key]?.explorerUrl;

  if (!explorerUrl) {
    return null;
  }

  const hash = encodeURIComponent(transactionHash.trim());

  if (key === "solana-devnet") {
    return `${explorerUrl}/tx/${hash}?cluster=devnet`;
  }

  return `${explorerUrl}/tx/${hash}`;
}
