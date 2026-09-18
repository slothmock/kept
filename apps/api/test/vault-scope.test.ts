import { describe, expect, it } from "vitest";

import { buildApp, type ApiDependencies } from "../src/app.js";

const dependencies: ApiDependencies = {
  authenticate: async (authorization) =>
    authorization === "Bearer valid-token"
      ? { privyUserId: "did:privy:user-1" }
      : null,
  persistence: {
    createUser: async ({ privyUserId }) => ({
      id: "user-1",
      privyUserId,
      displayName: null,
      createdAt: "2026-09-12T00:00:00.000Z",
      updatedAt: "2026-09-12T00:00:00.000Z",
    }),
  } as ApiDependencies["persistence"],
};

describe("vault-only API scope", () => {
  it("does not expose goal or commitment endpoints", async () => {
    const app = buildApp(dependencies);

    for (const [method, url] of [
      ["GET", "/v1/goals"],
      ["POST", "/v1/goals"],
      ["GET", "/v1/goals/goal-1"],
      ["GET", "/v1/commitments"],
      ["POST", "/v1/commitments"],
      ["GET", "/v1/commitments/commitment-1"],
      ["POST", "/v1/commitments/commitment-1/activate"],
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
