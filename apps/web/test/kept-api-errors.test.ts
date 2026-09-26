import { describe, expect, it, vi } from "vitest";

import { createKeptApi } from "../src/api/kept-api.js";
import { ConsumerError } from "../src/lib/consumer-error.js";

function allocation(goalId: string) {
  return {
    goalId,
    allocatedSharesAtomic: "100",
    totalVaultSharesAtomic: "300",
    totalAllocatedSharesAtomic: "200",
    unallocatedSharesAtomic: "100",
  };
}

describe("Kept API consumer errors", () => {
  it("maps missing authentication to a safe session message", async () => {
    const api = createKeptApi({
      baseUrl: "https://api.example",
      getAccessToken: async () => null,
      fetcher: async () => new Response("unused"),
    });

    await expect(api.listGoals()).rejects.toMatchObject({
      name: "ConsumerError",
      code: "authentication_required",
      message: "Your session has expired. Sign in again.",
    } satisfies Partial<ConsumerError>);
  });

  it("maps API authentication and request-in-progress codes", async () => {
    const responses = [
      new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED" } }), { status: 401 }),
      new Response(JSON.stringify({ error: { code: "REQUEST_IN_PROGRESS" } }), { status: 409 }),
    ];
    const api = createKeptApi({
      baseUrl: "https://api.example",
      getAccessToken: async () => "token",
      fetcher: async () => responses.shift() ?? new Response(null, { status: 500 }),
    });

    await expect(api.listGoals()).rejects.toMatchObject({
      code: "authentication_required",
      message: "Your session has expired. Sign in again.",
    });
    await expect(api.listGoals()).rejects.toMatchObject({
      code: "request_in_progress",
      message: "That request is already being processed. Wait a moment and try again.",
    });
  });

  it("maps fetch failures without exposing endpoint details", async () => {
    const api = createKeptApi({
      baseUrl: "https://private-api.example",
      getAccessToken: async () => "token",
      fetcher: async () => {
        throw new Error("fetch failed for https://private-api.example/v1/goals");
      },
    });

    await expect(api.listGoals()).rejects.toMatchObject({
      code: "connection_failed",
      message: "Kept couldn't connect. Check your connection and try again.",
    });
  });

  it.each([
    [400, "VALIDATION_ERROR", "validation_failed", "Check the information and try again."],
    [404, "NOT_FOUND", "not_found", "We couldn't find that item."],
    [409, "IDEMPOTENCY_CONFLICT", "request_conflict", "That request conflicts with a recent change. Refresh and try again."],
    [500, "INTERNAL_ERROR", "service_unavailable", "Kept is temporarily unavailable. Try again."],
  ])("maps HTTP %s responses to consumer-safe copy", async (status, apiCode, errorCode, message) => {
    const api = createKeptApi({
      baseUrl: "https://api.example",
      getAccessToken: async () => "token",
      fetcher: async () => new Response(JSON.stringify({ error: { code: apiCode } }), { status }),
    });

    await expect(api.listGoals()).rejects.toMatchObject({ code: errorCode, message });
  });

  it("reuses a caller-supplied idempotency key for draft recovery", async () => {
    let idempotencyHeader: string | null = null;

    const api = createKeptApi({
      baseUrl: "https://api.example",
      getAccessToken: async () => "token",
      fetcher: async (_url, init) => {
        idempotencyHeader = new Headers(init?.headers).get("idempotency-key");

        return new Response(
          JSON.stringify({ id: "draft-1" }),
          { status: 200 },
        );
      },
    });

    await api.createCommitment({
      goalId: "goal-1",
      definition: {
        code: "WEEKLY_SAVINGS_V1",
        version: 1,
      },
      parameters: {
        targetAmountAtomic: "10000000",
        periodDays: 7,
      },
      epochStart: "2026-09-23T00:05:00.000Z",
      epochEnd: "2026-09-30T00:05:00.000Z",
      verificationDeadline: "2026-10-01T00:05:00.000Z",
    }, "stable-draft-key");

    expect(idempotencyHeader).toBe("stable-draft-key");
  });

  it("parses goal allocations and sends signed atomic deltas with idempotency", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const response = {
      goalId: "goal-1",
      allocatedSharesAtomic: "100000000000000",
      totalVaultSharesAtomic: "500000000000000",
      totalAllocatedSharesAtomic: "100000000000000",
      unallocatedSharesAtomic: "400000000000000",
    };
    const api = createKeptApi({
      baseUrl: "https://api.example",
      getAccessToken: async () => "token",
      fetcher: async (url, init) => {
        requests.push({ url: String(url), init });
        return new Response(JSON.stringify(response), { status: 200 });
      },
    });

    await expect(api.getGoalAllocation("goal-1")).resolves.toEqual(response);
    await expect(api.allocateGoalShares("goal-1", {
      shareDeltaAtomic: "100000000000000",
      reason: "manual",
    }, "allocation-key")).resolves.toEqual(response);
    expect(requests[1]?.url).toBe("https://api.example/v1/goals/goal-1/allocations");
    expect(new Headers(requests[1]?.init?.headers).get("idempotency-key")).toBe("allocation-key");
    expect(requests[1]?.init?.body).toBe(JSON.stringify({
      shareDeltaAtomic: "100000000000000",
      reason: "manual",
    }));
  });

  it("archives a goal with the supplied idempotency key", async () => {
    const requests: Array<{
      url: string;
      init: RequestInit | undefined;
    }> = [];

    const archivedGoal = {
      id: "goal-1",
      userId: "user-1",
      name: "Laptop",
      targetAmountAtomic: "1000000000",
      targetAsset: "USDC",
      targetDate: null,
      status: "ARCHIVED",
      createdAt: "2026-09-18T00:00:00.000Z",
      updatedAt: "2026-09-25T20:00:00.000Z",
    };

    const api = createKeptApi({
      baseUrl: "https://api.example",
      getAccessToken: async () => "token",
      fetcher: async (url, init) => {
        requests.push({
          url: String(url),
          init,
        });

        return new Response(
          JSON.stringify(archivedGoal),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      },
    });

    await expect(
      api.archiveGoal(
        "goal-1",
        "archive-goal-key",
      ),
    ).resolves.toEqual(archivedGoal);

    expect(requests).toHaveLength(1);

    expect(requests[0]?.url).toBe(
      "https://api.example/v1/goals/goal-1/archive",
    );

    expect(requests[0]?.init?.method).toBe(
      "POST",
    );

    const headers = new Headers(
      requests[0]?.init?.headers,
    );

    expect(
      headers.get("authorization"),
    ).toBe("Bearer token");

    expect(
      headers.get("idempotency-key"),
    ).toBe("archive-goal-key");

    expect(requests[0]?.init?.body).toBe(
      JSON.stringify({}),
    );
  });

  it("encodes the goal id when archiving", async () => {
    const fetcher = vi.fn(async (
      input: RequestInfo | URL,
    ) => {
      expect(String(input)).toBe(
        "https://api.example/v1/goals/goal%2Fwith%20spaces/archive",
      );

      return new Response(
        JSON.stringify({
          id: "goal/with spaces",
          userId: "user-1",
          name: "Laptop",
          targetAmountAtomic: "1000000000",
          targetAsset: "USDC",
          targetDate: null,
          status: "ARCHIVED",
          createdAt: "2026-09-18T00:00:00.000Z",
          updatedAt: "2026-09-25T20:00:00.000Z",
        }),
        {
          status: 200,
          headers: {
            "content-type":
              "application/json",
          },
        },
      );
    });

    const api = createKeptApi({
      baseUrl: "https://api.example",
      getAccessToken: async () => "token",
      fetcher: fetcher as typeof fetch,
    });

    await api.archiveGoal(
      "goal/with spaces",
      "archive-key",
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed allocation atomic values", async () => {
    const api = createKeptApi({
      baseUrl: "https://api.example",
      getAccessToken: async () => "token",
      fetcher: async () => new Response(JSON.stringify({
        goalId: "goal-1",
        allocatedSharesAtomic: "1.5",
        totalVaultSharesAtomic: "10",
        totalAllocatedSharesAtomic: "1",
        unallocatedSharesAtomic: "9",
      }), { status: 200 }),
    });

    await expect(api.getGoalAllocation("goal-1")).rejects.toMatchObject({
      code: "service_unavailable",
      message: "Kept returned an unexpected response. Try again.",
    });
  });

  it("rejects an allocation response for a different goal", async () => {
    const api = createKeptApi({
      baseUrl: "https://api.example",
      getAccessToken: async () => "token",
      fetcher: async () => new Response(JSON.stringify({
        goalId: "goal-2",
        allocatedSharesAtomic: "1",
        totalVaultSharesAtomic: "10",
        totalAllocatedSharesAtomic: "1",
        unallocatedSharesAtomic: "9",
      }), { status: 200 }),
    });

    await expect(api.getGoalAllocation("goal-1")).rejects.toMatchObject({
      code: "service_unavailable",
    });
  });
});

describe("Kept goal allocation API", () => {
  it("sends an atomic goal reallocation request", async () => {
    const fetcher = vi.fn(async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      expect(String(input)).toBe(
        "http://kept.test/v1/goals/reallocate",
      );

      expect(init?.method).toBe("POST");

      const headers = new Headers(init?.headers);

      expect(headers.get("authorization")).toBe(
        "Bearer test-token",
      );

      expect(headers.get("idempotency-key")).toBe(
        "move-request-1",
      );

      expect(JSON.parse(String(init?.body))).toEqual({
        fromGoalId: "goal-a",
        toGoalId: "goal-b",
        shareAmountAtomic: "50",
      });

      return new Response(
        JSON.stringify({
          from: allocation("goal-a"),
          to: allocation("goal-b"),
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    });

    const api = createKeptApi({
      baseUrl: "http://kept.test",
      getAccessToken: async () => "test-token",
      fetcher: fetcher as typeof fetch,
    });

    await expect(
      api.reallocateGoalShares(
        {
          fromGoalId: "goal-a",
          toGoalId: "goal-b",
          shareAmountAtomic: "50",
        },
        "move-request-1",
      ),
    ).resolves.toEqual({
      from: allocation("goal-a"),
      to: allocation("goal-b"),
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects a malformed reallocation response", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          from: {
            goalId: "goal-a",
            allocatedSharesAtomic: "not-an-integer",
          },
          to: allocation("goal-b"),
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    const api = createKeptApi({
      baseUrl: "http://kept.test",
      getAccessToken: async () => "test-token",
      fetcher: fetcher as typeof fetch,
    });

    await expect(
      api.reallocateGoalShares(
        {
          fromGoalId: "goal-a",
          toGoalId: "goal-b",
          shareAmountAtomic: "50",
        },
        "move-request-2",
      ),
    ).rejects.toMatchObject({
      code: "service_unavailable",
    });
  });
});