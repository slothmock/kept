import { describe, expect, it, vi } from "vitest";

import { buildApp, type ApiDependencies } from "../src/app.js";

const walletAddress =
  "0x1CddcABc0060A869B78CC0D769C45AC6Ca5d8510";

const attackerWallet =
  "0x0000000000000000000000000000000000000001";

const user = {
  id: "user-1",
  privyUserId: "did:privy:user-1",
  displayName: null,
  createdAt: "2026-09-23T00:00:00.000Z",
  updatedAt: "2026-09-23T00:00:00.000Z",
} as const;

const allocation = {
  goalId: "goal-1",
  allocatedSharesAtomic: "100000000000000",
  totalVaultSharesAtomic: "250000000000000",
  totalAllocatedSharesAtomic: "100000000000000",
  unallocatedSharesAtomic: "150000000000000",
} as const;

function buildDependencies(
  overrides: Partial<ApiDependencies> = {},
): ApiDependencies {
  return {
    authenticate: async (
      authorization: string | undefined,
    ) => (
      authorization === "Bearer valid-token"
        ? {
          privyUserId: user.privyUserId,
          wallet:  walletAddress,
        }
        : null
    ),

    persistence: {
      createUser: async () => user,
      getGoalAllocation: vi.fn(async () => allocation),
      allocateGoalShares: vi.fn(async () => allocation),
    },

    ...overrides,
  } as unknown as ApiDependencies;
}

describe("goal allocation API", () => {
  it("reads an owned goal allocation using the server-authenticated wallet", async () => {
    const dependencies = buildDependencies();
    const app = buildApp(dependencies);

    const response = await app.inject({
      method: "GET",
      url: "/v1/goals/goal-1/allocation",
      headers: {
        authorization: "Bearer valid-token",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(allocation);

    expect(
      dependencies.persistence
        .getGoalAllocation as ReturnType<typeof vi.fn>
    ).toHaveBeenCalledWith(
      user.id,
      "goal-1",
      walletAddress,
    );

    await app.close();
  });

  it("appends an idempotent atomic delta using the server-authenticated wallet", async () => {
    const dependencies = buildDependencies();
    const app = buildApp(dependencies);

    const response = await app.inject({
      method: "POST",
      url: "/v1/goals/goal-1/allocations",
      headers: {
        authorization: "Bearer valid-token",
        "idempotency-key": "allocation-key",
      },
      payload: {
        shareDeltaAtomic: "100000000000000",
        reason: "manual",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(allocation);

    expect(
      dependencies.persistence
        .allocateGoalShares as ReturnType<typeof vi.fn>
    ).toHaveBeenCalledWith({
      userId: user.id,
      goalId: "goal-1",
      walletAddress,
      shareDeltaAtomic: "100000000000000",
      reason: "manual",
      idempotencyKey: "allocation-key",
    });

    await app.close();
  });

  it("does not trust a client-supplied wallet address", async () => {
    const dependencies = buildDependencies();
    const app = buildApp(dependencies);

    const response = await app.inject({
      method: "POST",
      url: "/v1/goals/goal-1/allocations",
      headers: {
        authorization: "Bearer valid-token",
        "idempotency-key": "server-wallet-test",
      },
      payload: {
        walletAddress: attackerWallet,
        shareDeltaAtomic: "100000000000000",
        reason: "manual",
      },
    });

    expect(response.statusCode).toBe(200);

    expect(
      dependencies.persistence
        .allocateGoalShares as ReturnType<typeof vi.fn>
    ).toHaveBeenCalledWith({
      userId: user.id,
      goalId: "goal-1",
      walletAddress,
      shareDeltaAtomic: "100000000000000",
      reason: "manual",
      idempotencyKey: "server-wallet-test",
    });

    await app.close();
  });

  it("rejects allocation access when Privy has no embedded wallet", async () => {
    const dependencies = buildDependencies({
      authenticate: async () => ({
        privyUserId: user.privyUserId,
        wallet: null,
      }),
    });

    const app = buildApp(dependencies);

    const response = await app.inject({
      method: "GET",
      url: "/v1/goals/goal-1/allocation",
      headers: {
        authorization: "Bearer valid-token",
      },
    });

    expect(response.statusCode).toBe(404);

    expect(
      dependencies.persistence
        .getGoalAllocation as ReturnType<typeof vi.fn>
    ).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects a non-integer atomic allocation delta without appending", async () => {
    const dependencies = buildDependencies();
    const app = buildApp(dependencies);

    const response = await app.inject({
      method: "POST",
      url: "/v1/goals/goal-1/allocations",
      headers: {
        authorization: "Bearer valid-token",
        "idempotency-key": "bad-delta",
      },
      payload: {
        shareDeltaAtomic: "1.5",
        reason: "manual",
      },
    });

    expect(response.statusCode).toBe(400);

    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
      },
    });

    expect(
      dependencies.persistence
        .allocateGoalShares as ReturnType<typeof vi.fn>
    ).not.toHaveBeenCalled();

    await app.close();
  });
});