import { describe, expect, it, vi } from "vitest";

import {
  createAuthenticatedJsonClient,
} from "../src/api/http-client.js";

describe("authenticated JSON client", () => {
  it("owns authentication and transport headers", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({ ok: true }),
        { status: 200 },
      ),
    );

    const client =
      createAuthenticatedJsonClient({
        baseUrl:
          "https://kept.ngrok-free.app",
        getAccessToken:
          async () => "token",
        fetcher:
          fetcher as typeof fetch,
      });

    await client.post(
      "/v1/example",
      { amount: "10" },
      "stable-key",
    );

    const [
      url,
      init,
    ] =
      fetcher.mock.calls[0]!;

    expect(String(url)).toBe(
      "https://kept.ngrok-free.app/v1/example",
    );

    const headers =
      new Headers(init?.headers);

    expect(
      headers.get("authorization"),
    ).toBe("Bearer token");

    expect(
      headers.get("content-type"),
    ).toBe("application/json");

    expect(
      headers.get(
        "ngrok-skip-browser-warning",
      ),
    ).toBe("true");

    expect(
      headers.get("idempotency-key"),
    ).toBe("stable-key");
  });
});
