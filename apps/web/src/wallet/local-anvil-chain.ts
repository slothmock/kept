import type { Chain } from "@privy-io/chains";

export function createLocalAnvilChain(rpcUrl: string): Chain {
  return {
    id: 31337,
    name: "Kept Local Anvil",
    network: "kept-local-anvil",
    testnet: true,
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: {
      default: {
        http: [rpcUrl],
      },
    },
  };
}
