import { describe, expect, it } from "vitest";

import { buildApp, type ApiDependencies } from "../src/app.js";
import { StaleCommitmentVersionError } from "../src/domain/commitments/index.js";

function buildDependencies(overrides: Partial<ApiDependencies> = {}): ApiDependencies {
  return {
    authenticate: async (authorization) => {
      if (authorization === "Bearer valid-token") {
        return { privyUserId: "did:privy:user-1" };
      }
      return null;
    },
    persistence: {
      createUser: async ({ privyUserId }) => ({
        id: "user-1",
        privyUserId,
        displayName: null,
        createdAt: "2026-09-12T00:00:00.000Z",
        updatedAt: "2026-09-12T00:00:00.000Z",
      }),
      createGoal: async ({ userId, name, targetAmountAtomic, targetDate }) => ({
        id: "goal-1",
        userId,
        name,
        targetAmountAtomic,
        targetAsset: "USDC",
        targetDate,
        status: "ACTIVE" as const,
        createdAt: "2026-09-12T00:00:00.000Z",
        updatedAt: "2026-09-12T00:00:00.000Z",
      }),
      listGoals: async (userId) => [
        {
          id: "goal-1",
          userId,
          name: "Laptop",
          targetAmountAtomic: "100000000",
          targetAsset: "USDC",
          targetDate: null,
          status: "ACTIVE" as const,
          createdAt: "2026-09-12T00:00:00.000Z",
          updatedAt: "2026-09-12T00:00:00.000Z",
        },
      ],
      getGoal: async (userId, id) =>
        userId === "user-1" && id === "goal-1"
          ? {
              id,
              userId,
              name: "Laptop",
              targetAmountAtomic: "100000000",
              targetAsset: "USDC",
              targetDate: null,
              status: "ACTIVE" as const,
              createdAt: "2026-09-12T00:00:00.000Z",
              updatedAt: "2026-09-12T00:00:00.000Z",
            }
          : null,
      createCommitmentDraft: async ({ userId, goalId, definition, parameters, epochStart, epochEnd, verificationDeadline }) => ({
        id: "commitment-1",
        userId,
        savingsGoalId: goalId,
        definition,
        parameters,
        epochStart,
        epochEnd,
        verificationDeadline,
        state: "DRAFT" as const,
        stateVersion: 1,
        activatedAt: null,
        finalizedAt: null,
        createdAt: "2026-09-12T00:00:00.000Z",
        updatedAt: "2026-09-12T00:00:00.000Z",
      }),
      getCommitment: async (userId, id) =>
        userId === "user-1" && id === "commitment-1"
          ? {
              id,
              userId,
              savingsGoalId: "goal-1",
              definition: { code: "WEEKLY_SAVINGS_V1", version: 1 },
              parameters: { targetAmountAtomic: "100000000", periodDays: 7 },
              epochStart: "2026-09-14T00:00:00.000Z",
              epochEnd: "2026-09-21T00:00:00.000Z",
              verificationDeadline: "2026-09-22T00:00:00.000Z",
              state: "DRAFT" as const,
              stateVersion: 1,
              activatedAt: null,
              finalizedAt: null,
              createdAt: "2026-09-12T00:00:00.000Z",
              updatedAt: "2026-09-12T00:00:00.000Z",
            }
          : null,
      listCommitments: async (userId) => [
        {
          id: "commitment-1",
          userId,
          savingsGoalId: "goal-1",
          definition: { code: "WEEKLY_SAVINGS_V1", version: 1 },
          parameters: { targetAmountAtomic: "100000000", periodDays: 7 },
          epochStart: "2026-09-14T00:00:00.000Z",
          epochEnd: "2026-09-21T00:00:00.000Z",
          verificationDeadline: "2026-09-22T00:00:00.000Z",
          state: "DRAFT" as const,
          stateVersion: 1,
          activatedAt: null,
          finalizedAt: null,
          createdAt: "2026-09-12T00:00:00.000Z",
          updatedAt: "2026-09-12T00:00:00.000Z",
        },
      ],
      activateCommitment: async ({ userId, commitmentId }) => ({
        id: commitmentId,
        userId,
        savingsGoalId: "goal-1",
        definition: { code: "WEEKLY_SAVINGS_V1", version: 1 },
        parameters: { targetAmountAtomic: "100000000", periodDays: 7 },
        epochStart: "2026-09-14T00:00:00.000Z",
        epochEnd: "2026-09-21T00:00:00.000Z",
        verificationDeadline: "2026-09-22T00:00:00.000Z",
        state: "ACTIVE" as const,
        stateVersion: 2,
        activatedAt: "2026-09-12T00:00:00.000Z",
        finalizedAt: null,
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

  it("rejects a private request without a valid Privy access token", async () => {
    const app = buildApp(buildDependencies());

    const response = await app.inject({ method: "GET", url: "/v1/me" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: { code: "UNAUTHENTICATED" } });
    await app.close();
  });

  it("returns the API error schema for malformed JSON and unsupported content types", async () => {
    const app = buildApp(buildDependencies());
    const malformedJson = await app.inject({
      method: "POST",
      url: "/v1/goals",
      headers: {
        authorization: "Bearer valid-token",
        "content-type": "application/json",
        "idempotency-key": "bad-json-1",
      },
      payload: "{",
    });
    expect(malformedJson.statusCode).toBe(400);
    expect(malformedJson.json()).toEqual({ error: { code: "VALIDATION_ERROR" } });

    const unsupportedContentType = await app.inject({
      method: "POST",
      url: "/v1/goals",
      headers: {
        authorization: "Bearer valid-token",
        "content-type": "application/xml",
        "idempotency-key": "unsupported-content-type-1",
      },
      payload: "<goal />",
    });
    expect(unsupportedContentType.statusCode).toBe(415);
    expect(unsupportedContentType.json()).toEqual({ error: { code: "UNSUPPORTED_MEDIA_TYPE" } });
    await app.close();
  });

  it("returns the API error schema for unmatched routes and oversized bodies", async () => {
    const app = buildApp(buildDependencies());
    const unmatched = await app.inject({
      method: "GET",
      url: "/v1/does-not-exist",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(unmatched.statusCode).toBe(404);
    expect(unmatched.json()).toEqual({ error: { code: "NOT_FOUND" } });

    const tooLarge = await app.inject({
      method: "POST",
      url: "/v1/goals",
      headers: {
        authorization: "Bearer valid-token",
        "content-type": "text/plain",
        "idempotency-key": "too-large-1",
      },
      payload: "x".repeat(1_048_577),
    });
    expect(tooLarge.statusCode).toBe(413);
    expect(tooLarge.json()).toEqual({ error: { code: "PAYLOAD_TOO_LARGE" } });
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

  it("creates a goal for the authenticated user only when an idempotency key is supplied", async () => {
    const app = buildApp(buildDependencies());

    const missingKey = await app.inject({
      method: "POST",
      url: "/v1/goals",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Laptop", targetAmountAtomic: "100000000", targetDate: null },
    });
    expect(missingKey.statusCode).toBe(400);
    expect(missingKey.json()).toEqual({ error: { code: "VALIDATION_ERROR" } });

    const response = await app.inject({
      method: "POST",
      url: "/v1/goals",
      headers: {
        authorization: "Bearer valid-token",
        "idempotency-key": "goal-create-1",
      },
      payload: { name: "Laptop", targetAmountAtomic: "100000000", targetDate: null },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: "goal-1",
      userId: "user-1",
      name: "Laptop",
    });
    await app.close();
  });

  it("lists goals and commitments only through the authenticated user's scope", async () => {
    const app = buildApp(buildDependencies());

    const goals = await app.inject({
      method: "GET",
      url: "/v1/goals",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(goals.statusCode).toBe(200);
    expect(goals.json()).toEqual([expect.objectContaining({ id: "goal-1", userId: "user-1" })]);

    const commitments = await app.inject({
      method: "GET",
      url: "/v1/commitments",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(commitments.statusCode).toBe(200);
    expect(commitments.json()).toEqual([
      expect.objectContaining({ id: "commitment-1", userId: "user-1" }),
    ]);
    await app.close();
  });

  it("returns a non-existent or other user's goal as not found", async () => {
    const app = buildApp(buildDependencies());

    const response = await app.inject({
      method: "GET",
      url: "/v1/goals/not-owned",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { code: "NOT_FOUND" } });
    await app.close();
  });

  it("creates and activates a commitment using the authenticated user and idempotency key", async () => {
    const app = buildApp(buildDependencies());
    const draft = await app.inject({
      method: "POST",
      url: "/v1/commitments",
      headers: { authorization: "Bearer valid-token", "idempotency-key": "commitment-create-1" },
      payload: {
        goalId: "goal-1",
        definition: { code: "WEEKLY_SAVINGS_V1", version: 1 },
        parameters: { targetAmountAtomic: "100000000", periodDays: 7 },
        epochStart: "2026-09-14T00:00:00.000Z",
        epochEnd: "2026-09-21T00:00:00.000Z",
        verificationDeadline: "2026-09-22T00:00:00.000Z",
      },
    });
    expect(draft.statusCode).toBe(201);
    expect(draft.json()).toMatchObject({ id: "commitment-1", userId: "user-1", state: "DRAFT" });

    const active = await app.inject({
      method: "POST",
      url: "/v1/commitments/commitment-1/activate",
      headers: { authorization: "Bearer valid-token", "idempotency-key": "commitment-activate-1" },
      payload: { expectedVersion: 1 },
    });
    expect(active.statusCode).toBe(200);
    expect(active.json()).toMatchObject({ id: "commitment-1", userId: "user-1", state: "ACTIVE" });
    await app.close();
  });

  it("returns an optimistic-concurrency conflict when activating a stale commitment version", async () => {
    const dependencies = buildDependencies();
    const app = buildApp({
      ...dependencies,
      persistence: {
        ...dependencies.persistence,
        activateCommitment: async () => {
          throw new StaleCommitmentVersionError(1, 2);
        },
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/commitments/commitment-1/activate",
      headers: { authorization: "Bearer valid-token", "idempotency-key": "stale-activate-1" },
      payload: { expectedVersion: 1 },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { code: "COMMITMENT_CONFLICT" } });
    await app.close();
  });

  it("returns commitments only through the authenticated owner's scope", async () => {
    const app = buildApp(buildDependencies());

    const owned = await app.inject({
      method: "GET",
      url: "/v1/commitments/commitment-1",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(owned.statusCode).toBe(200);
    expect(owned.json()).toMatchObject({ id: "commitment-1", userId: "user-1" });

    const missing = await app.inject({
      method: "GET",
      url: "/v1/commitments/not-owned",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });
});
