import { describe, expect, it } from "vitest";

import {
  resolveAppBootstrap,
} from "../src/app/bootstrap-config.js";

const validVaultEnvironment = {
  VITE_MONAD_RPC_URL: "https://rpc.example.com",
  VITE_MONAD_CHAIN_ID: "143",
  VITE_KEPT_VAULT_ADDRESS:
    "0x1111111111111111111111111111111111111111",
  VITE_MONAD_USDC_ADDRESS:
    "0x2222222222222222222222222222222222222222",
};

describe("resolveAppBootstrap", () => {
  it("blocks startup when the Privy app id is missing", () => {
    expect(
      resolveAppBootstrap({
        ...validVaultEnvironment,
      }),
    ).toEqual({
      kind: "error",
      message:
        "VITE_PRIVY_APP_ID is required to start Kept.",
    });
  });

  it("requires the MoonPay key only when fiat is enabled", () => {
    expect(
      resolveAppBootstrap({
        ...validVaultEnvironment,
        VITE_PRIVY_APP_ID: "privy-app",
        VITE_FIAT_ENABLED: "true",
      }),
    ).toEqual({
      kind: "error",
      message:
        "VITE_MOONPAY_PUBLISHABLE_KEY is required when fiat is enabled.",
    });

    const disabled = resolveAppBootstrap({
      ...validVaultEnvironment,
      VITE_PRIVY_APP_ID: "privy-app",
      VITE_FIAT_ENABLED: "false",
    });

    expect(disabled.kind).toBe("ready");

    if (disabled.kind === "ready") {
      expect(disabled.config.moonPayPublishableKey).toBeNull();
    }
  });

  it("uses Monad mainnet for chain id 143", () => {
    const result = resolveAppBootstrap({
      ...validVaultEnvironment,
      VITE_PRIVY_APP_ID: "privy-app",
    });

    expect(result.kind).toBe("ready");

    if (result.kind === "ready") {
      expect(result.config.keptChain.id).toBe(143);
      expect(result.config.supportedChains[0]?.id).toBe(143);
    }
  });

  it("uses the configured Monad testnet RPC for chain id 10143", () => {
    const result = resolveAppBootstrap({
      ...validVaultEnvironment,
      VITE_PRIVY_APP_ID: "privy-app",
      VITE_MONAD_CHAIN_ID: "10143",
      VITE_MONAD_RPC_URL: "https://testnet-rpc.example.com",
    });

    expect(result.kind).toBe("ready");

    if (result.kind === "ready") {
      expect(result.config.keptChain.id).toBe(10143);
      expect(
        result.config.keptChain.rpcUrls.default.http,
      ).toEqual(["https://testnet-rpc.example.com"]);
    }
  });

  it("uses local Anvil only when explicitly enabled", () => {
    const result = resolveAppBootstrap({
      ...validVaultEnvironment,
      VITE_PRIVY_APP_ID: "privy-app",
      VITE_MONAD_CHAIN_ID: "31337",
      VITE_MONAD_RPC_URL: "http://127.0.0.1:8545",
      VITE_ENABLE_LOCAL_ANVIL: "true",
    });

    expect(result.kind).toBe("ready");

    if (result.kind === "ready") {
      expect(result.config.keptChain.id).toBe(31337);
      expect(
        result.config.keptChain.rpcUrls.default.http,
      ).toEqual(["http://127.0.0.1:8545"]);
    }
  });

  it("preserves the current Monad-mainnet fallback when vault config is invalid", () => {
    const result = resolveAppBootstrap({
      VITE_PRIVY_APP_ID: "privy-app",
    });

    expect(result.kind).toBe("ready");

    if (result.kind === "ready") {
      expect(result.config.keptChain.id).toBe(143);
    }
  });
});
