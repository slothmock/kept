import { describe, expect, it } from "vitest";

import { createKeptApi } from "../src/api/kept-api.js";
import { ConsumerError } from "../src/lib/consumer-error.js";

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
});