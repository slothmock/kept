import { describe, expect, it } from "vitest";

import { loadApiConfig } from "../src/config.js";

describe("API configuration", () => {
  it("loads required database and Privy public verification settings", () => {
    expect(
      loadApiConfig({
        DATABASE_URL: "postgresql://kept:kept_local_dev@127.0.0.1:55432/kept_test",
        PRIVY_APP_ID: "privy-app-id",
        PRIVY_JWT_VERIFICATION_KEY: "public-verification-key",
        PORT: "3100",
      }),
    ).toEqual({
      databaseUrl: "postgresql://kept:kept_local_dev@127.0.0.1:55432/kept_test",
      privyAppId: "privy-app-id",
      privyJwtVerificationKey: "public-verification-key",
      port: 3100,
    });
  });

  it("rejects missing required configuration and invalid ports", () => {
    expect(() => loadApiConfig({})).toThrow("DATABASE_URL is required");
    expect(() =>
      loadApiConfig({
        DATABASE_URL: "postgresql://kept:kept_local_dev@127.0.0.1:55432/kept_test",
        PRIVY_APP_ID: "privy-app-id",
        PRIVY_JWT_VERIFICATION_KEY: "public-verification-key",
        PORT: "0",
      }),
    ).toThrow("PORT must be a valid TCP port");
  });
});
