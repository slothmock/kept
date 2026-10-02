import { describe, expect, it } from "vitest";

import { createPrivyAuthenticator } from "../src/auth.js";

describe("Privy access-token authentication", () => {
  it("verifies only bearer access tokens and returns the Privy user identity", async () => {
    const authenticate = createPrivyAuthenticator({
      appId: "test-app",
      appSecret: "test-secret",
      verificationKey: "test-verification-key",

      verifyAccessToken: async ({ access_token }) => {
        expect(access_token).toBe("access-token");

        return {
          user_id: "did:privy:user-1",
        };
      },

      getLinkedAccounts: async (userId) => {
        expect(userId).toBe("did:privy:user-1");
        return [];
      },
    });

    await expect(
      authenticate(undefined),
    ).resolves.toBeNull();

    await expect(
      authenticate("Basic not-a-token"),
    ).resolves.toBeNull();

    await expect(
      authenticate("Bearer access-token"),
    ).resolves.toEqual({
      privyUserId: "did:privy:user-1",
      wallet: null,
    });
  });

  it("rejects invalid Privy access tokens without exposing verifier errors", async () => {
    const authenticate = createPrivyAuthenticator({
      appId: "test-app",
      appSecret: "test-secret",
      verificationKey: "test-verification-key",

      verifyAccessToken: async () => {
        throw new Error("sensitive verifier error");
      },

      getLinkedAccounts: async () => {
        throw new Error(
          "linked accounts must not be fetched after verification fails",
        );
      },
    });

    await expect(
      authenticate("Bearer invalid-token"),
    ).resolves.toBeNull();
  });
});