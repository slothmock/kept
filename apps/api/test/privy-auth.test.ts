import { describe, expect, it, vi } from "vitest";

import { createPrivyAuthenticator } from "../src/auth.js";

describe("Privy access-token authentication", () => {
  it("verifies only bearer access tokens and returns the Privy user identity", async () => {
    const verify = vi.fn().mockResolvedValue({ user_id: "did:privy:user-1" });
    const authenticate = createPrivyAuthenticator({
      appId: "app-id",
      verificationKey: "public-key",
      verifyAccessToken: verify,
    });

    await expect(authenticate(undefined)).resolves.toBeNull();
    await expect(authenticate("Basic not-a-token")).resolves.toBeNull();
    await expect(authenticate("Bearer access-token")).resolves.toEqual({
      privyUserId: "did:privy:user-1",
    });
    expect(verify).toHaveBeenCalledWith({
      access_token: "access-token",
      app_id: "app-id",
      verification_key: "public-key",
    });
  });

  it("rejects invalid Privy access tokens without exposing verifier errors", async () => {
    const authenticate = createPrivyAuthenticator({
      appId: "app-id",
      verificationKey: "public-key",
      verifyAccessToken: vi.fn().mockRejectedValue(new Error("invalid token")),
    });

    await expect(authenticate("Bearer invalid-token")).resolves.toBeNull();
  });
});
