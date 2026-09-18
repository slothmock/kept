import { describe, expect, it } from "vitest";

import { buildApp, type ApiDependencies } from "../src/app.js";

const dependencies = {
  authenticate: async (authorization: string | undefined) =>
    authorization === "Bearer valid-token"
      ? { privyUserId: "did:privy:user-1" }
      : null,
  persistence: {
    createUser: async ({ privyUserId }: { privyUserId: string }) => ({
      id: "user-1",
      privyUserId,
      displayName: null,
      createdAt: "2026-09-12T00:00:00.000Z",
      updatedAt: "2026-09-12T00:00:00.000Z",
    }),
  },
} as unknown as ApiDependencies;

describe("vault authority boundary", () => {
  it("does not expose server-side deposit, withdrawal, balance, or share mutation endpoints", async () => {
    const app = buildApp(dependencies);

    for (const [method, url] of [
      ["POST", "/v1/vault/deposit"],
      ["POST", "/v1/vault/withdraw"],
      ["POST", "/v1/vault/redeem"],
      ["POST", "/v1/vault/shares"],
      ["GET", "/v1/balance"],
    ] as const) {
      const response = await app.inject({
        method,
        url,
        headers: { authorization: "Bearer valid-token" },
      });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: { code: "NOT_FOUND" } });
    }

    await app.close();
  });
});
