import { describe, expect, it } from "vitest";

import { createLocalAnvilChain } from "../src/wallet/local-anvil-chain.js";

describe("createLocalAnvilChain", () => {
  it("uses the same validated RPC URL as vault reads", () => {
    const chain = createLocalAnvilChain("http://localhost:9545");

    expect(chain.id).toBe(31337);
    expect(chain.rpcUrls.default.http).toEqual(["http://localhost:9545"]);
  });
});
