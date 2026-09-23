import { describe, expect, it, vi } from "vitest";

import { buildApp, type ApiDependencies } from "../src/app.js";

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

function buildDependencies(): ApiDependencies {
  return {
    authenticate: async (authorization: string | undefined) => (
      authorization === "Bearer valid-token" ? { privyUserId: user.privyUserId } : null
    ),
    persistence: {
      createUser: async () => user,
      getGoalAllocation: vi.fn(async () => allocation),
      allocateGoalShares: vi.fn(async () => allocation),
    },
  } as unknown as ApiDependencies;
}

describe("goal allocation API", () => {
  it("reads an owned goal allocation and appends an idempotent atomic delta", async () => {
    const dependencies = buildDependencies();
    const app = buildApp(dependencies);
    const auth = { authorization: "Bearer valid-token" };

    const read = await app.inject({
      method: "GET",
      url: "/v1/goals/goal-1/allocation",
      headers: auth,
    });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual(allocation);
    expect((dependencies.persistence.getGoalAllocation as ReturnType<typeof vi.fn>))
      .toHaveBeenCalledWith(user.id, "goal-1");

    const write = await app.inject({
      method: "POST",
      url: "/v1/goals/goal-1/allocations",
      headers: { ...auth, "idempotency-key": "allocation-key" },
      payload: { shareDeltaAtomic: "100000000000000", reason: "manual" },
    });
    expect(write.statusCode).toBe(200);
    expect(write.json()).toEqual(allocation);
    expect((dependencies.persistence.allocateGoalShares as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({
      userId: user.id,
      goalId: "goal-1",
      shareDeltaAtomic: "100000000000000",
      reason: "manual",
      idempotencyKey: "allocation-key",
    });

    await app.close();
  });

  it("rejects a non-integer atomic allocation delta without appending", async () => {
    const dependencies = buildDependencies();
    const app = buildApp(dependencies);

    const response = await app.inject({
      method: "POST",
      url: "/v1/goals/goal-1/allocations",
      headers: { authorization: "Bearer valid-token", "idempotency-key": "bad-delta" },
      payload: { shareDeltaAtomic: "1.5", reason: "manual" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { code: "VALIDATION_ERROR" } });
    expect((dependencies.persistence.allocateGoalShares as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    await app.close();
  });
});
