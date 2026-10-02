import type { Chain } from "@privy-io/chains";

export function createMonadTestnetChain(rpcUrl: string): Chain {
  return {
    id: 10143,
    name: "Monad Testnet",
    network: "monad-testnet",
    testnet: true,
    nativeCurrency: {
      name: "Monad",
      symbol: "MON",
      decimals: 18,
    },
    rpcUrls: {
      default: {
        http: [rpcUrl],
      },
    },
    blockExplorers: {
      default: {
        name: "Monadscan",
        url: "https://testnet.monadscan.com",
      },
    },
  };
}
