import {
  createIntentsConnectApi,
} from "@aurora-is-near/intents-connect";

import type {
  AccessTokenProvider,
} from "@/api/http-client";
import {
  createProxyAuthenticatedFetch,
} from "./intents-auth-fetch";

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
      createProxyAuthenticatedFetch({
        proxyUrl:
          apiKeyProxyUrl,
        getAccessToken,
      }),
  });
}
