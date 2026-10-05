import { describe, expect, it } from "vitest";

import {
  selectPrivyEvmWallet,
} from "../src/infrastructure/wallet/privy-evm-wallet.js";

describe("Privy EVM wallet adapter", () => {
  it("selects the embedded Privy Ethereum wallet only", () => {
    const wallets = [
      {
        address: "solana-wallet",
        type: "solana",
        walletClientType: "privy",
      },
      {
        address: "external-evm",
        type: "ethereum",
        walletClientType: "metamask",
      },
      {
        address: "kept-evm",
        type: "ethereum",
        walletClientType: "privy",
      },
    ] as const;

    expect(
      selectPrivyEvmWallet(wallets)
        ?.address,
    ).toBe("kept-evm");
  });
});
