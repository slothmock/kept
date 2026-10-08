import type {
  AccessTokenProvider,
} from "@/api/http-client";

export function createProxyAuthenticatedFetch(input: {
  readonly proxyUrl: string;
  readonly getAccessToken: AccessTokenProvider;
  readonly fetcher?: typeof fetch;
}) {
  const proxyUrl =
    new URL(input.proxyUrl);

  const fetcher =
    input.fetcher ?? fetch;

  return async (
    request: string,
    init: RequestInit = {},
  ): Promise<Response> => {
    const requestUrl =
      new URL(request);

    const headers =
      new Headers(init.headers);

    if (
      requestUrl.origin === proxyUrl.origin
      && requestUrl.pathname.startsWith(
        proxyUrl.pathname,
      )
    ) {
      const accessToken =
        await input.getAccessToken();

      if (!accessToken) {
        throw new Error(
          "Your session has expired. Sign in again.",
        );
      }

      headers.set(
        "authorization",
        `Bearer ${accessToken}`,
      );
    }

    return fetcher(
      request,
      {
        ...init,
        headers,
      },
    );
  };
}
