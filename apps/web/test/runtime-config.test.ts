import { describe, expect, it } from "vitest";

import { readApiBaseUrl } from "../src/api/kept-api.js";
import {
  readCommitmentManagerConfig,
  readVaultConfig,
} from "../src/vault/config.js";

const vault = "0x1111111111111111111111111111111111111111";
const usdc = "0x2222222222222222222222222222222222222222";

describe("public runtime configuration", () => {
  it("does not fall back to a local API when the API URL is missing", () => {
    expect(readApiBaseUrl({})).toBeNull();
  });

  it("accepts only HTTP API URLs and removes trailing slashes", () => {
    expect(readApiBaseUrl({ VITE_KEPT_API_URL: "ftp://api.example.com" })).toBeNull();
    expect(readApiBaseUrl({ VITE_KEPT_API_URL: "https://api.example.com/" })).toBe("https://api.example.com");
  });

  it("supports Monad mainnet, Monad testnet, and explicitly enabled local Anvil", () => {
    const base = {
      VITE_MONAD_RPC_URL: "https://rpc.monad.example",
      VITE_KEPT_VAULT_ADDRESS: vault,
      VITE_MONAD_USDC_ADDRESS: usdc,
    };

    expect(readVaultConfig({ ...base, VITE_MONAD_CHAIN_ID: "1" })).toBeNull();
    expect(readVaultConfig({ ...base, VITE_MONAD_CHAIN_ID: "143" })?.chainId).toBe(143);
    expect(readVaultConfig({ ...base, VITE_MONAD_CHAIN_ID: "10143" })?.chainId).toBe(10143);
    expect(readVaultConfig({
      ...base,
      VITE_ENABLE_LOCAL_ANVIL: "true",
      VITE_MONAD_CHAIN_ID: "31337",
    })?.chainId).toBe(31337);
  });
});

describe("readCommitmentManagerConfig", () => {
  it("requires a valid configured contract address", () => {
    expect(readCommitmentManagerConfig({})).toBeNull();
    expect(
      readCommitmentManagerConfig({ VITE_COMMITMENT_MANAGER_ADDRESS: "invalid" }),
    ).toBeNull();
    expect(
      readCommitmentManagerConfig({
        VITE_COMMITMENT_MANAGER_ADDRESS: "0x0000000000000000000000000000000000000003",
      }),
    ).toEqual({ address: "0x0000000000000000000000000000000000000003" });
  });
});
