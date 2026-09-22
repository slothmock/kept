import { describe, expect, it } from "vitest";

import { createMonadChain } from "../src/chain/monad-chain.js";

describe("createMonadChain", () => {
  it("configures Privy for Monad mainnet using the validated public RPC", () => {
    const chain = createMonadChain("https://rpc.monad.example");

    expect(chain.id).toBe(143);
    expect(chain.name).toBe("Monad");
    expect(chain.nativeCurrency.symbol).toBe("MON");
    expect(chain.rpcUrls.default.http).toEqual(["https://rpc.monad.example"]);
  });
});
