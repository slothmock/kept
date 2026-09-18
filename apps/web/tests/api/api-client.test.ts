import { describe, expect, it, vi } from "vitest";

import { createKeptApi, readApiBaseUrl } from "../../src/api/kept-api.js";

describe("Kept API client", () => {
  it("defaults to the local API", () => {
    expect(readApiBaseUrl({})).toBe("http://127.0.0.1:3000");
  });

  it("sends Privy auth and idempotency for writes", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer token");
      expect(headers.get("idempotency-key")).toBeTruthy();
      return new Response(JSON.stringify({ id: "goal-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const api = createKeptApi({
      baseUrl: "http://api.test",
      getAccessToken: async () => "token",
      fetcher: fetcher as typeof fetch,
    });

    await api.createGoal({ name: "Emergency fund", targetAmountAtomic: "1000000000", targetDate: null });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
