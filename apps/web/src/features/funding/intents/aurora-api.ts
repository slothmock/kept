import {
  createIntentsConnectApi,
} from "@aurora-is-near/intents-connect";

import type {
  AccessTokenProvider,
} from "@/api/http-client";

const baseUrl =
  import.meta.env.VITE_AURORA_INTENTS_BASE_URL;

const apiKeyProxyUrl =
  import.meta.env.VITE_AURORA_INTENTS_API_KEY_PROXY_URL;

if (!baseUrl) {
  throw new Error(
    "VITE_AURORA_INTENTS_BASE_URL is required.",
  );
}

if (!apiKeyProxyUrl) {
  throw new Error(
    "VITE_AURORA_INTENTS_API_KEY_PROXY_URL is required.",
  );
}

const proxyUrl =
  new URL(apiKeyProxyUrl);

export const intentsConnectApi =
  createIntentsConnectApi({
    baseUrl,
    apiKeyProxyUrl,
  });

export function createAuthenticatedIntentsConnectApi(
  getAccessToken: AccessTokenProvider,
) {
  return createIntentsConnectApi({
    baseUrl,
    apiKeyProxyUrl,
    fetch:
      async (
        input,
        init,
      ) => {
        const requestUrl =
          new URL(input);

        const headers = {
          ...(init?.headers ?? {}),
        };

        if (
          requestUrl.origin
            === proxyUrl.origin
          && requestUrl.pathname
            .startsWith(
              proxyUrl.pathname,
            )
        ) {
          const accessToken =
            await getAccessToken();

          if (!accessToken) {
            throw new Error(
              "Your session has expired. Sign in again.",
            );
          }

          headers.authorization =
            `Bearer ${accessToken}`;
        }

        return fetch(
          input,
          {
            ...init,
            headers,
          },
        );
      },
  });
}
