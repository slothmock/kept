import { describe, expect, it } from "vitest";

import { readVaultConfig } from "../vault-config.js";

const completeEnvironment = {
  VITE_MONAD_RPC_URL: "https://rpc.example.test",
  VITE_MONAD_CHAIN_ID: "143",
  VITE_KEPT_VAULT_ADDRESS: "0x2222222222222222222222222222222222222222",
  VITE_MONAD_USDC_ADDRESS: "0x1111111111111111111111111111111111111111",
};

describe("vault configuration", () => {
  it("returns a verified public configuration only when every deployment value is present", () => {
    expect(readVaultConfig(completeEnvironment)).toEqual({
      rpcUrl: "https://rpc.example.test",
      chainId: 143,
      vault: "0x2222222222222222222222222222222222222222",
      usdc: "0x1111111111111111111111111111111111111111",
    });
  });

  it("keeps transaction functionality unavailable for incomplete deployment configuration", () => {
    expect(readVaultConfig({ ...completeEnvironment, VITE_KEPT_VAULT_ADDRESS: undefined })).toBeNull();
  });
});
