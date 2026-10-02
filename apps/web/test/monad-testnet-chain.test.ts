import { describe, expect, it } from "vitest";

import { createMonadTestnetChain } from "../src/chain/monad-testnet-chain.js";

describe("createMonadTestnetChain", () => {
  it("uses the configured Monad testnet RPC URL", () => {
    const chain = createMonadTestnetChain("https://rpc.testnet.monad.xyz");

    expect(chain.id).toBe(10143);
    expect(chain.testnet).toBe(true);
    expect(chain.nativeCurrency.symbol).toBe("MON");
    expect(chain.rpcUrls.default.http).toEqual(["https://rpc.testnet.monad.xyz"]);
  });
});
