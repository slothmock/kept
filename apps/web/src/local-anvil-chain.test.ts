import { describe, expect, it } from "vitest";

import { localAnvilChain } from "./local-anvil-chain.js";

describe("local Anvil chain", () => {
  it("identifies the locally guarded Anvil deployment and its RPC endpoint", () => {
    expect(localAnvilChain.id).toBe(31337);
    expect(localAnvilChain.rpcUrls.default.http).toEqual(["http://127.0.0.1:8545"]);
  });
});
