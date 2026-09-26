import { describe, expect, it, vi } from "vitest";

import { buildApp, type ApiDependencies } from "../src/app.js";
import { CommitmentSettlementMismatchError } from "../src/commitment-settlement.js";
import type { CommitmentDto } from "../src/persistence/index.js";
import {
  NotFoundError,
  PersistenceValidationError,
} from "../src/persistence/index.js";

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
  onchainCommitmentId: null,
  createdAt: "2026-09-18T00:00:00.000Z",
  updatedAt: "2026-09-18T00:00:00.000Z",
};

function buildDependencies(overrides: Partial<ApiDependencies> = {}): ApiDependencies {
  let currentCommitment: CommitmentDto = commitment;
  return {
    authenticate: async (authorization) =>
      authorization === "Bearer valid-token"
        ? {
          privyUserId: user.privyUserId,
          wallet:
            "0x0000000000000000000000000000000000000001",
        }
        : null,
    persistence: {
      createUser: async () => user,
      createGoal: async () => goal,
      getGoal: async (_userId, id) => (id === goal.id ? goal : null),
      listGoals: async () => [goal],
      archiveGoal: async () => ({
        ...goal,
        status: "ARCHIVED" as const,
      }),
      getGoalAllocation: async (_userId, id) => (id === goal.id ? {
        goalId: goal.id,
        allocatedSharesAtomic: "0",
        totalVaultSharesAtomic: "0",
        totalAllocatedSharesAtomic: "0",
        unallocatedSharesAtomic: "0",
      } : null),
      allocateGoalShares: async () => ({
        goalId: goal.id,
        allocatedSharesAtomic: "0",
        totalVaultSharesAtomic: "0",
        totalAllocatedSharesAtomic: "0",
        unallocatedSharesAtomic: "0",
      }),
      reallocateGoalShares: async () => ({
        from: {
          goalId: goal.id,
          allocatedSharesAtomic: "0",
          totalVaultSharesAtomic: "0",
          totalAllocatedSharesAtomic: "0",
          unallocatedSharesAtomic: "0",
        },
        to: {
          goalId: goal.id,
          allocatedSharesAtomic: "0",
          totalVaultSharesAtomic: "0",
          totalAllocatedSharesAtomic: "0",
          unallocatedSharesAtomic: "0",
        },
      }),
      createCommitmentDraft: async () => commitment,
      getCommitment: async (_userId, id) => (id === commitment.id ? currentCommitment : null),
      listCommitments: async () => [currentCommitment],
      activateCommitment: async () => {
        currentCommitment = {
          ...commitment,
          state: "ACTIVE" as const,
          stateVersion: 2,
          onchainCommitmentId: "7",
          activatedAt: "2026-09-18T01:00:00.000Z",
        };
        return currentCommitment;
      },
      cancelCommitment: async () => {
        currentCommitment = {
          ...currentCommitment,
          state: "CANCELLED" as const,
          stateVersion: 3,
          finalizedAt: "2026-09-18T01:00:00.000Z",
        };
        return currentCommitment;
      },

    },
    commitmentSettlementVerifier: {
      inspect: async () => ({
        settlementRef: new Uint8Array(32),
        owner: "0x2222222222222222222222222222222222222222",
        chainId: 143,
        status: 1,
      }),
      verifyActive: async () => ({
        settlementRef: new Uint8Array(32),
        owner: "0x2222222222222222222222222222222222222222",
        chainId: 143,
        status: 1,
      }),
      verifyCancelled: async () => ({
        settlementRef: new Uint8Array(32),
        owner: "0x2222222222222222222222222222222222222222",
        chainId: 143,
        status: 4,
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

  it("archives a goal with the authenticated user and idempotency key", async () => {
    const dependencies = buildDependencies();

    const archiveGoal = vi.spyOn(
      dependencies.persistence,
      "archiveGoal",
    );

    const app = buildApp(dependencies);

    const response = await app.inject({
      method: "POST",
      url: `/v1/goals/${goal.id}/archive`,
      headers: {
        ...auth,
        "idempotency-key": "archive-goal-key",
      },
      payload: {},
    });

    expect(response.statusCode).toBe(200);

    expect(response.json()).toEqual({
      ...goal,
      status: "ARCHIVED",
    });

    expect(archiveGoal).toHaveBeenCalledOnce();

    expect(archiveGoal).toHaveBeenCalledWith({
      userId: user.id,
      goalId: goal.id,
      idempotencyKey: "archive-goal-key",
    });

    await app.close();
  });

  it("does not allow the request body to override goal archive ownership", async () => {
    const dependencies = buildDependencies();

    const archiveGoal = vi.spyOn(
      dependencies.persistence,
      "archiveGoal",
    );

    const app = buildApp(dependencies);

    const response = await app.inject({
      method: "POST",
      url: `/v1/goals/${goal.id}/archive`,
      headers: {
        ...auth,
        "idempotency-key": "archive-owner-key",
      },
      payload: {
        userId: "attacker-user",
        walletAddress:
          "0x9999999999999999999999999999999999999999",
      },
    });

    expect(response.statusCode).toBe(200);

    expect(archiveGoal).toHaveBeenCalledWith({
      userId: user.id,
      goalId: goal.id,
      idempotencyKey: "archive-owner-key",
    });

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
      payload: {
        expectedVersion: 1,
        onchainCommitmentId: "7",
        transactionHash: `0x${"a".repeat(64)}`,
      },
    });
    expect(activated.statusCode).toBe(200);
    expect(activated.json()).toMatchObject({ state: "ACTIVE", stateVersion: 2 });

    const cancelled = await app.inject({
      method: "POST",
      url: `/v1/commitments/${commitment.id}/cancel`,
      headers: { ...auth, "idempotency-key": "cancel-key" },
      payload: {
        expectedVersion: 2,
        onchainCommitmentId: "7",
        owner: "0x0000000000000000000000000000000000000002",
      },
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json()).toMatchObject({ state: "CANCELLED", stateVersion: 3 });

    const retriedCancellation = await app.inject({
      method: "POST",
      url: `/v1/commitments/${commitment.id}/cancel`,
      headers: { ...auth, "idempotency-key": "cancel-key" },
      payload: {
        expectedVersion: 2,
        onchainCommitmentId: "7",
        owner: "0x0000000000000000000000000000000000000002",
      },
    });
    expect(retriedCancellation.statusCode).toBe(200);
    expect(retriedCancellation.json()).toEqual(cancelled.json());
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

  it("requires an idempotency key when archiving a goal", async () => {
    const dependencies = buildDependencies();

    const archiveGoal = vi.spyOn(
      dependencies.persistence,
      "archiveGoal",
    );

    const app = buildApp(dependencies);

    const response = await app.inject({
      method: "POST",
      url: `/v1/goals/${goal.id}/archive`,
      headers: auth,
      payload: {},
    });

    expect(response.statusCode).toBe(400);

    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
      },
    });

    expect(archiveGoal).not.toHaveBeenCalled();

    await app.close();
  });

  it("returns not found when the goal cannot be archived for the authenticated user", async () => {
    const dependencies = buildDependencies();

    vi.spyOn(
      dependencies.persistence,
      "archiveGoal",
    ).mockRejectedValue(
      new NotFoundError("Savings goal"),
    );

    const app = buildApp(dependencies);

    const response = await app.inject({
      method: "POST",
      url: "/v1/goals/missing-goal/archive",
      headers: {
        ...auth,
        "idempotency-key": "archive-missing-key",
      },
      payload: {},
    });

    expect(response.statusCode).toBe(404);

    expect(response.json()).toEqual({
      error: {
        code: "NOT_FOUND",
      },
    });

    await app.close();
  });

  it("returns validation error when an active commitment still blocks goal archival", async () => {
    const dependencies = buildDependencies();

    vi.spyOn(
      dependencies.persistence,
      "archiveGoal",
    ).mockRejectedValue(
      new PersistenceValidationError(
        "Active commitment must be cancelled before the goal can be archived",
      ),
    );

    const app = buildApp(dependencies);

    const response = await app.inject({
      method: "POST",
      url: `/v1/goals/${goal.id}/archive`,
      headers: {
        ...auth,
        "idempotency-key":
          "archive-active-commitment",
      },
      payload: {},
    });

    expect(response.statusCode).toBe(400);

    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
      },
    });

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

  it("does not activate API state when confirmed chain state does not match", async () => {
    const app = buildApp(buildDependencies({
      commitmentSettlementVerifier: {
        inspect: async () => ({
          settlementRef: new Uint8Array(32),
          owner: "0x2222222222222222222222222222222222222222",
          chainId: 143,
          status: 1,
        }),
        verifyActive: async () => {
          throw new CommitmentSettlementMismatchError("reference mismatch");
        },
        verifyCancelled: async () => ({
          settlementRef: new Uint8Array(32),
          owner: "0x2222222222222222222222222222222222222222",
          chainId: 143,
          status: 4,
        }),
      },
    }));
    const response = await app.inject({
      method: "POST",
      url: `/v1/commitments/${commitment.id}/activate`,
      headers: { ...auth, "idempotency-key": "activate-mismatch" },
      payload: {
        expectedVersion: 1,
        onchainCommitmentId: "7",
        transactionHash: `0x${"a".repeat(64)}`,
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: { code: "COMMITMENT_SETTLEMENT_MISMATCH" },
    });
    await app.close();
  });

  it("does not cancel API state until the contract is cancelled", async () => {
    const app = buildApp(buildDependencies({
      commitmentSettlementVerifier: {
        inspect: async () => ({
          settlementRef: new Uint8Array(32),
          owner: "0x2222222222222222222222222222222222222222",
          chainId: 143,
          status: 1,
        }),
        verifyActive: async () => ({
          settlementRef: new Uint8Array(32),
          owner: "0x2222222222222222222222222222222222222222",
          chainId: 143,
          status: 1,
        }),
        verifyCancelled: async () => {
          throw new CommitmentSettlementMismatchError("contract is still active");
        },
      },
    }));
    await app.inject({
      method: "POST",
      url: `/v1/commitments/${commitment.id}/activate`,
      headers: { ...auth, "idempotency-key": "activate-before-cancel" },
      payload: {
        expectedVersion: 1,
        onchainCommitmentId: "7",
        transactionHash: `0x${"a".repeat(64)}`,
      },
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/commitments/${commitment.id}/cancel`,
      headers: { ...auth, "idempotency-key": "cancel-still-active" },
      payload: {
        expectedVersion: 2,
        onchainCommitmentId: "7",
        owner: "0x0000000000000000000000000000000000000002",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: { code: "COMMITMENT_SETTLEMENT_MISMATCH" },
    });
    await app.close();
  });

  it("reconciles a terminal onchain status before returning commitments", async () => {
    const dependencies = buildDependencies();
    const inspect = vi.fn()
      .mockResolvedValueOnce({
        settlementRef: new Uint8Array(32),
        owner: "0x2222222222222222222222222222222222222222",
        chainId: 143,
        status: 4,
      })
      .mockResolvedValue({
        settlementRef: new Uint8Array(32),
        owner: "0x2222222222222222222222222222222222222222",
        chainId: 143,
        status: 1,
      });
    const app = buildApp({
      ...dependencies,
      commitmentSettlementVerifier: {
        ...dependencies.commitmentSettlementVerifier!,
        inspect,
      },
    });
    await app.inject({
      method: "POST",
      url: `/v1/commitments/${commitment.id}/activate`,
      headers: { ...auth, "idempotency-key": "activate-before-reconcile" },
      payload: {
        expectedVersion: 1,
        onchainCommitmentId: "7",
        transactionHash: `0x${"a".repeat(64)}`,
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/commitments",
      headers: auth,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({ state: "CANCELLED", stateVersion: 2 }),
    ]);
    const afterReorg = await app.inject({
      method: "GET",
      url: "/v1/commitments",
      headers: auth,
    });
    expect(afterReorg.json()).toEqual([
      expect.objectContaining({ state: "ACTIVE", stateVersion: 2 }),
    ]);
    await app.close();
  });
});
