import { describe, expect, it } from "vitest";

import { selectKeptEvmWallet } from "../../src/chain/evm-wallet.js";

describe("Kept EVM wallet selection", () => {
  it("selects the user's embedded Ethereum wallet instead of a Solana wallet", () => {
    const wallet = selectKeptEvmWallet([
      { address: "SolanaAddress", type: "solana", walletClientType: "phantom" },
      { address: "0xEvmWallet", type: "ethereum", walletClientType: "privy" },
    ]);

    expect(wallet).toEqual({ address: "0xEvmWallet", type: "ethereum", walletClientType: "privy" });
  });

  it("returns null when no Ethereum wallet is available", () => {
    expect(
      selectKeptEvmWallet([{ address: "SolanaAddress", type: "solana", walletClientType: "phantom" }]),
    ).toBeNull();
  });

  it("does not select an external Ethereum wallet as the Kept account", () => {
    expect(
      selectKeptEvmWallet([{ address: "0xExternal", type: "ethereum", walletClientType: "metamask" }]),
    ).toBeNull();
  });
});
