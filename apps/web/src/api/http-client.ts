import {
  ConsumerError,
} from "../lib/consumer-error.js";

export type AccessTokenProvider =
  () => Promise<string | null>;

export interface AuthenticatedJsonClient {
  request<T>(
    path: string,
    init?: RequestInit,
  ): Promise<T>;

  post<T>(
    path: string,
    body: unknown,
    idempotencyKey?: string,
  ): Promise<T>;
}

function generatedIdempotencyKey(): string {
  return (
    globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random()}`
  );
}

function apiConsumerError(
  status: number,
  code: string,
  cause?: unknown,
  metadata?: {
    readonly progressPercent?:
      number | null;
  },
): ConsumerError {
  if (
    status === 401
    || code === "UNAUTHENTICATED"
  ) {
    return new ConsumerError(
      "Your session has expired. Sign in again.",
      {
        code:
          "authentication_required",
        cause,
        diagnosticCode: code,
      },
    );
  }

  if (
    code ===
    "REQUEST_IN_PROGRESS"
  ) {
    return new ConsumerError(
      "That request is already being processed. Wait a moment and try again.",
      {
        code:
          "request_in_progress",
        cause,
        diagnosticCode: code,
      },
    );
  }

  if (
    code ===
    "SAVINGS_HISTORY_SYNCHRONIZING"
  ) {
    return new ConsumerError(
      "Savings history is synchronising.",
      {
        code: "synchronizing",
        cause,
        diagnosticCode: code,
        ...(metadata?.progressPercent
          !== undefined
          ? {
              progressPercent:
                metadata.progressPercent,
            }
          : {}),
      },
    );
  }

  if (
    code ===
    "RPC_RATE_LIMITED"
  ) {
    return new ConsumerError(
      "Kept is syncing with the network. Try again shortly.",
      {
        code: "rate_limited",
        cause,
        diagnosticCode: code,
      },
    );
  }

  if (status === 409) {
    return new ConsumerError(
      "That request conflicts with a recent change. Refresh and try again.",
      {
        code: "request_conflict",
        cause,
        diagnosticCode: code,
      },
    );
  }

  if (status === 404) {
    return new ConsumerError(
      "We couldn't find that item.",
      {
        code: "not_found",
        cause,
        diagnosticCode: code,
      },
    );
  }

  if (
    status === 400
    || status === 413
    || status === 415
  ) {
    return new ConsumerError(
      "Check the information and try again.",
      {
        code: "validation_failed",
        cause,
        diagnosticCode: code,
      },
    );
  }

  return new ConsumerError(
    "Kept is temporarily unavailable. Try again.",
    {
      code: "service_unavailable",
      cause,
      diagnosticCode: code,
    },
  );
}

export function createAuthenticatedJsonClient(input: {
  readonly baseUrl: string;
  readonly getAccessToken:
    AccessTokenProvider;
  readonly fetcher?: typeof fetch;
}): AuthenticatedJsonClient {
  const fetcher =
    input.fetcher ?? fetch;

  async function request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    let accessToken:
      string | null;

    try {
      accessToken =
        await input.getAccessToken();
    } catch (error) {
      throw new ConsumerError(
        "We couldn't verify your session. Sign in again.",
        {
          code:
            "authentication_required",
          cause: error,
        },
      );
    }

    if (!accessToken) {
      throw new ConsumerError(
        "Your session has expired. Sign in again.",
        {
          code:
            "authentication_required",
        },
      );
    }

    const headers =
      new Headers(init.headers);

    headers.set(
      "authorization",
      `Bearer ${accessToken}`,
    );

    if (init.body) {
      headers.set(
        "content-type",
        "application/json",
      );
    }

    const apiUrl =
      new URL(input.baseUrl);

    if (
      apiUrl.hostname.endsWith(
        ".ngrok-free.dev",
      )
      || apiUrl.hostname.endsWith(
        ".ngrok-free.app",
      )
    ) {
      headers.set(
        "ngrok-skip-browser-warning",
        "true",
      );
    }

    let response: Response;

    try {
      response =
        await fetcher(
          `${input.baseUrl}${path}`,
          {
            ...init,
            headers,
          },
        );
    } catch (error) {
      throw new ConsumerError(
        "Kept couldn't connect. Check your connection and try again.",
        {
          code:
            "connection_failed",
          cause: error,
        },
      );
    }

    if (!response.ok) {
      let code =
        `HTTP_${response.status}`;

      let responseParseError:
        unknown;

      let progressPercent:
        number | null | undefined;

      try {
        const body =
          await response.json() as {
            error?: {
              code?: string;
              progressPercent?:
                number | null;
            };
          };

        code =
          body.error?.code
          ?? code;

        progressPercent =
          typeof body.error
            ?.progressPercent
            === "number"
            ? body.error
                .progressPercent
            : body.error
                ?.progressPercent
                === null
              ? null
              : undefined;
      } catch (error) {
        responseParseError =
          error;
      }

      throw apiConsumerError(
        response.status,
        code,
        responseParseError,
        progressPercent
          !== undefined
          ? { progressPercent }
          : undefined,
      );
    }

    try {
      return (
        await response.json()
      ) as T;
    } catch (error) {
      throw new ConsumerError(
        "Kept returned an unexpected response. Try again.",
        {
          code:
            "service_unavailable",
          cause: error,
        },
      );
    }
  }

  function post<T>(
    path: string,
    body: unknown,
    requestIdempotencyKey =
      generatedIdempotencyKey(),
  ): Promise<T> {
    return request<T>(
      path,
      {
        method: "POST",
        headers: {
          "idempotency-key":
            requestIdempotencyKey,
        },
        body:
          JSON.stringify(body),
      },
    );
  }

  return {
    request,
    post,
  };
}
