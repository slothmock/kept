import { describe, expect, it } from "vitest";

import { loadApiConfig } from "../src/config.js";

const requiredEnvironment = {
  DATABASE_URL: "postgresql://kept:kept_local_dev@127.0.0.1:55432/kept_test",
  PRIVY_APP_ID: "privy-app-id",
  PRIVY_JWT_VERIFICATION_KEY: "public-verification-key",
  PRIVY_APP_SECRET: "privy-app-secret",
  WEB_ORIGIN: "http://localhost:5173",
  MONAD_RPC_URL: "https://rpc.monad.example",
  HELIUS_RPC_URL: "https://helius.example",
  MONAD_CHAIN_ID: "143",
  COMMITMENT_MANAGER_ADDRESS: "0x0000000000000000000000000000000000000001",
  COMMITMENT_VERIFIER_PRIVATE_KEY: `0x${"11".repeat(32)}`,
  KEPT_SAVINGS_VAULT_ADDRESS: "0x0000000000000000000000000000000000000002",
  AURORA_INTENTS_BASE_URL: "https://intents-connect-alpha-api.aurora.dev",
  AURORA_INTENTS_API_KEY: "test-aurora-key",
  MOONPAY_WIDGET_BASE_URL: "https://widget.moonpay.example",
  MOONPAY_PUBLISHABLE_KEY: "moonpay-publishable-key",
  MOONPAY_SECRET_KEY: "moonpay-secret-key",
} satisfies NodeJS.ProcessEnv;

describe("API configuration", () => {
  it("loads required database, Privy, and commitment settlement settings", () => {
    expect(
      loadApiConfig({
        ...requiredEnvironment,
        PORT: "3100",
        WEB_ORIGIN: "https://app.kept.example",
      }),
    ).toEqual({
      databaseUrl:
        requiredEnvironment.DATABASE_URL,

      privyAppId:
        "privy-app-id",

      privyJwtVerificationKey:
        "public-verification-key",

      privyAppSecret:
        "privy-app-secret",

      port:
        3100,

      webOrigin:
        "https://app.kept.example",

      monadRpcUrl:
        "https://rpc.monad.example/",

      solanaRpcUrl:
        "https://helius.example/",

      monadChainId:
        143,

      commitmentManagerAddress:
        "0x0000000000000000000000000000000000000001",

      commitmentVerifierPrivateKey:
        "0x1111111111111111111111111111111111111111111111111111111111111111",

      keptSavingsVaultAddress:
        "0x0000000000000000000000000000000000000002",

      auroraIntentsBaseUrl:
        "https://intents-connect-alpha-api.aurora.dev/",

      auroraIntentsApiKey:
        "test-aurora-key",

      moonPayBaseUrl:
        "https://widget.moonpay.example",

      moonPayPublishableKey:
        "moonpay-publishable-key",

      moonPaySecretKey:
        "moonpay-secret-key",
    });
  });

  it("rejects missing required configuration and invalid ports", () => {
    expect(() => loadApiConfig({})).toThrow("DATABASE_URL is required");
    expect(() =>
      loadApiConfig({
        ...requiredEnvironment,
        PORT: "70000",
      }),
    ).toThrow("PORT must be a valid TCP port");
  });

  it("supports Monad testnet and allows local Anvil only with explicit opt-in", () => {
    expect(
      loadApiConfig({
        ...requiredEnvironment,
        MONAD_CHAIN_ID: "10143",
      }).monadChainId,
    ).toBe(10143);

    expect(() =>
      loadApiConfig({ ...requiredEnvironment, MONAD_CHAIN_ID: "31337" }),
    ).toThrow("ENABLE_LOCAL_ANVIL=true");

    expect(
      loadApiConfig({
        ...requiredEnvironment,
        MONAD_CHAIN_ID: "31337",
        ENABLE_LOCAL_ANVIL: "true",
      }).monadChainId,
    ).toBe(31337);
  });

  it("rejects invalid settlement RPC and contract configuration", () => {
    expect(() =>
      loadApiConfig({ ...requiredEnvironment, MONAD_RPC_URL: "not-a-url" }),
    ).toThrow("MONAD_RPC_URL must be an absolute HTTP(S) URL");
    expect(() =>
      loadApiConfig({ ...requiredEnvironment, COMMITMENT_MANAGER_ADDRESS: "invalid" }),
    ).toThrow("COMMITMENT_MANAGER_ADDRESS must be a valid EVM address");
    expect(() =>
      loadApiConfig({ ...requiredEnvironment, MONAD_CHAIN_ID: "1" }),
    ).toThrow("MONAD_CHAIN_ID must be 143, 10143");
  });

  it(
    "allows a shortened commitment window on explicitly enabled local Anvil",
    () => {
      const config =
        loadApiConfig({
          ...requiredEnvironment,
          MONAD_CHAIN_ID:
            "31337",
          ENABLE_LOCAL_ANVIL:
            "true",
          DEV_COMMITMENT_WINDOW_SECONDS:
            "120",
        });

      expect(
        config.commitmentWindowOverrideSeconds,
      ).toBe(120);
    },
  );

  it(
    "does not configure a commitment window override by default",
    () => {
      const config =
        loadApiConfig({
          ...requiredEnvironment,
        });

      expect(
        config.commitmentWindowOverrideSeconds,
      ).toBeUndefined();
    },
  );

  it(
    "rejects the dev commitment window outside local Anvil",
    () => {
      expect(
        () =>
          loadApiConfig({
            ...requiredEnvironment,
            DEV_COMMITMENT_WINDOW_SECONDS:
              "120",
          }),
      ).toThrow(
        "DEV_COMMITMENT_WINDOW_SECONDS may only be used with local Anvil",
      );
    },
  );

  it.each([
    "0",
    "9",
    "-1",
    "1.5",
    "banana",
    "86401",
  ])(
    "rejects invalid dev commitment window %s",
    (value) => {
      expect(
        () =>
          loadApiConfig({
            ...requiredEnvironment,
            MONAD_CHAIN_ID:
              "31337",
            ENABLE_LOCAL_ANVIL:
              "true",
            DEV_COMMITMENT_WINDOW_SECONDS:
              value,
          }),
      ).toThrow(
        "DEV_COMMITMENT_WINDOW_SECONDS must be an integer between 10 and 86400",
      );
    },
  );
});
