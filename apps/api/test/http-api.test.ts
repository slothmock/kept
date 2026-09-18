import { describe, expect, it } from "vitest";

import { buildApp, type ApiDependencies } from "../src/app.js";

const user = {
  id: "user-1",
  privyUserId: "did:privy:user-1",
  displayName: null,
  createdAt: "2026-09-12T00:00:00.000Z",
  updatedAt: "2026-09-12T00:00:00.000Z",
} as const;

const goal = {
  id: "goal-1",
  userId: user.id,
  name: "Laptop",
  targetAmountAtomic: "1000000000",
  targetAsset: "USDC",
  targetDate: null,
  status: "ACTIVE" as const,
  createdAt: "2026-09-18T00:00:00.000Z",
  updatedAt: "2026-09-18T00:00:00.000Z",
};

const commitment = {
  id: "commitment-1",
  userId: user.id,
  savingsGoalId: goal.id,
  definition: { code: "WEEKLY_SAVINGS_V1", version: 1 },
  parameters: { targetAmountAtomic: "25000000", periodDays: 7 },
  epochStart: "2026-09-20T00:00:00.000Z",
  epochEnd: "2026-09-27T00:00:00.000Z",
  verificationDeadline: "2026-09-28T00:00:00.000Z",
  state: "DRAFT" as const,
  stateVersion: 1,
  activatedAt: null,
  finalizedAt: null,
  createdAt: "2026-09-18T00:00:00.000Z",
  updatedAt: "2026-09-18T00:00:00.000Z",
};

function buildDependencies(overrides: Partial<ApiDependencies> = {}): ApiDependencies {
  return {
    authenticate: async (authorization) =>
      authorization === "Bearer valid-token"
        ? { privyUserId: user.privyUserId }
        : null,
    persistence: {
      createUser: async () => user,
      createGoal: async () => goal,
      getGoal: async (_userId, id) => (id === goal.id ? goal : null),
      listGoals: async () => [goal],
      createCommitmentDraft: async () => commitment,
      getCommitment: async (_userId, id) => (id === commitment.id ? commitment : null),
      listCommitments: async () => [commitment],
      activateCommitment: async () => ({
        ...commitment,
        state: "ACTIVE" as const,
        stateVersion: 2,
        activatedAt: "2026-09-18T01:00:00.000Z",
      }),
      cancelCommitment: async () => ({
        ...commitment,
        state: "CANCELLED" as const,
        stateVersion: 2,
        finalizedAt: "2026-09-18T01:00:00.000Z",
      }),
    },
    ...overrides,
  };
}

const auth = { authorization: "Bearer valid-token" };

describe("Kept HTTP API", () => {
  it("reports health without authentication", async () => {
    const app = buildApp(buildDependencies());
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    await app.close();
  });

  it("bootstraps the authenticated Privy user", async () => {
    const app = buildApp(buildDependencies());
    const response = await app.inject({ method: "GET", url: "/v1/me", headers: auth });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: user.id, privyUserId: user.privyUserId });
    await app.close();
  });

  it("rejects private requests without authentication", async () => {
    const app = buildApp(buildDependencies());
    const response = await app.inject({ method: "GET", url: "/v1/goals" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: { code: "UNAUTHENTICATED" } });
    await app.close();
  });

  it("lists and reads goals", async () => {
    const app = buildApp(buildDependencies());
    const list = await app.inject({ method: "GET", url: "/v1/goals", headers: auth });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual([goal]);

    const one = await app.inject({ method: "GET", url: `/v1/goals/${goal.id}`, headers: auth });
    expect(one.statusCode).toBe(200);
    expect(one.json()).toEqual(goal);
    await app.close();
  });

  it("creates a goal with an idempotency key", async () => {
    const app = buildApp(buildDependencies());
    const response = await app.inject({
      method: "POST",
      url: "/v1/goals",
      headers: { ...auth, "idempotency-key": "goal-key" },
      payload: { name: "Laptop", targetAmountAtomic: "1000000000", targetDate: null },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(goal);
    await app.close();
  });

  it("lists, creates, activates, and cancels commitments", async () => {
    const app = buildApp(buildDependencies());

    const list = await app.inject({ method: "GET", url: "/v1/commitments", headers: auth });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual([commitment]);

    const created = await app.inject({
      method: "POST",
      url: "/v1/commitments",
      headers: { ...auth, "idempotency-key": "commitment-key" },
      payload: {
        goalId: goal.id,
        definition: commitment.definition,
        parameters: commitment.parameters,
        epochStart: commitment.epochStart,
        epochEnd: commitment.epochEnd,
        verificationDeadline: commitment.verificationDeadline,
      },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toEqual(commitment);

    const activated = await app.inject({
      method: "POST",
      url: `/v1/commitments/${commitment.id}/activate`,
      headers: { ...auth, "idempotency-key": "activate-key" },
      payload: { expectedVersion: 1 },
    });
    expect(activated.statusCode).toBe(200);
    expect(activated.json()).toMatchObject({ state: "ACTIVE", stateVersion: 2 });

    const cancelled = await app.inject({
      method: "POST",
      url: `/v1/commitments/${commitment.id}/cancel`,
      headers: { ...auth, "idempotency-key": "cancel-key" },
      payload: { expectedVersion: 1 },
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json()).toMatchObject({ state: "CANCELLED", stateVersion: 2 });
    await app.close();
  });

  it("requires idempotency keys for writes", async () => {
    const app = buildApp(buildDependencies());
    const response = await app.inject({
      method: "POST",
      url: "/v1/goals",
      headers: auth,
      payload: { name: "Laptop", targetAmountAtomic: "1000000000", targetDate: null },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { code: "VALIDATION_ERROR" } });
    await app.close();
  });

  it("allows browser reads and writes from the configured Kept web origin", async () => {
    const app = buildApp(buildDependencies(), { webOrigin: "http://localhost:5173" });
    const response = await app.inject({
      method: "OPTIONS",
      url: "/v1/goals",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type,idempotency-key",
      },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    await app.close();
  });
});
