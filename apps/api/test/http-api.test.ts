import { describe, expect, it } from "vitest";

import { buildApp, type ApiDependencies } from "../src/app.js";

function buildDependencies(overrides: Partial<ApiDependencies> = {}): ApiDependencies {
  return {
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
    },
    ...overrides,
  };
}

describe("Kept HTTP API", () => {
  it("reports health without requiring authentication", async () => {
    const app = buildApp(buildDependencies());
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    await app.close();
  });

  it("bootstraps and returns the user derived from the verified Privy identity", async () => {
    const app = buildApp(buildDependencies());
    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: "user-1",
      privyUserId: "did:privy:user-1",
    });
    await app.close();
  });

  it("rejects private requests without a verified Privy access token", async () => {
    const app = buildApp(buildDependencies());
    const response = await app.inject({ method: "GET", url: "/v1/me" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: { code: "UNAUTHENTICATED" } });
    await app.close();
  });

  it("does not expose the removed goals and commitments endpoints", async () => {
    const app = buildApp(buildDependencies());

    for (const url of ["/v1/goals", "/v1/commitments"]) {
      const response = await app.inject({
        method: "GET",
        url,
        headers: { authorization: "Bearer valid-token" },
      });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: { code: "NOT_FOUND" } });
    }

    await app.close();
  });

  it("allows browser reads only from the configured Kept web origin", async () => {
    const app = buildApp(buildDependencies(), { webOrigin: "http://localhost:5173" });
    const response = await app.inject({
      method: "OPTIONS",
      url: "/v1/me",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "GET",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    await app.close();
  });

  it("allows the equivalent 127.0.0.1 development origin", async () => {
    const app = buildApp(buildDependencies(), { webOrigin: "http://localhost:5173" });
    const response = await app.inject({
      method: "OPTIONS",
      url: "/v1/me",
      headers: {
        origin: "http://127.0.0.1:5173",
        "access-control-request-method": "GET",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:5173");
    await app.close();
  });
});
