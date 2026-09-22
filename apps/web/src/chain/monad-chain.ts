import type { Chain } from "@privy-io/chains";

export function createMonadChain(rpcUrl: string): Chain {
  return {
    id: 143,
    name: "Monad",
    network: "monad",
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
  };
}
