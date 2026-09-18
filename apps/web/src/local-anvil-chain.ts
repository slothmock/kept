import type { Chain } from "@privy-io/chains";

export const localAnvilChain: Chain = {
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
      http: ["http://127.0.0.1:8545"],
    },
  },
};
