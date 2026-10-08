import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createProxyAuthenticatedFetch,
} from "../src/features/funding/intents/intents-auth-fetch";

describe("Intents proxy authenticated fetch", () => {
  it("adds the Privy bearer token only for Kept proxy requests", async () => {
    const fetcher = vi.fn(
      async (
        _input: RequestInfo | URL,
        _init?: RequestInit,
      ) =>
        new Response("{}", {
          status: 200,
        }),
    );

    const authenticatedFetch =
      createProxyAuthenticatedFetch({
        proxyUrl:
          "https://api.kept.example/api/intents-connect",
        getAccessToken:
          async () => "privy-token",
        fetcher:
          fetcher as typeof fetch,
      });

    await authenticatedFetch(
      "https://api.kept.example/api/intents-connect/api/v1/executions/0xabc",
      {
        method: "POST",
      },
    );

    const proxyInit =
      fetcher.mock.calls[0]?.[1];

    expect(
      new Headers(
        proxyInit?.headers,
      ).get("authorization"),
    ).toBe("Bearer privy-token");

    await authenticatedFetch(
      "https://intents-connect-alpha-api.aurora.dev/api/v1/supported_tokens",
    );

    const upstreamInit =
      fetcher.mock.calls[1]?.[1];

    expect(
      new Headers(
        upstreamInit?.headers,
      ).has("authorization"),
    ).toBe(false);
  });

  it("fails closed when the Privy session has no access token", async () => {
    const fetcher =
      vi.fn<typeof fetch>();

    const authenticatedFetch =
      createProxyAuthenticatedFetch({
        proxyUrl:
          "https://api.kept.example/api/intents-connect",
        getAccessToken:
          async () => null,
        fetcher,
      });

    await expect(
      authenticatedFetch(
        "https://api.kept.example/api/intents-connect/api/v1/executions/0xabc",
      ),
    ).rejects.toThrow(
      "Your session has expired",
    );

    expect(fetcher).not.toHaveBeenCalled();
  });
});
