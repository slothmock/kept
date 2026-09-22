import { ConsumerError } from "../lib/consumer-error.js";

export type GoalStatus = "ACTIVE" | "COMPLETED" | "ARCHIVED";
export type CommitmentState = "DRAFT" | "ACTIVE" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface GoalDto {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly targetAmountAtomic: string;
  readonly targetAsset: string;
  readonly targetDate: string | null;
  readonly status: GoalStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CommitmentDto {
  readonly id: string;
  readonly userId: string;
  readonly savingsGoalId: string;
  readonly definition: {
    readonly code: string;
    readonly version: number;
  };
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly epochStart: string;
  readonly epochEnd: string;
  readonly verificationDeadline: string;
  readonly state: CommitmentState;
  readonly stateVersion: number;
  readonly activatedAt: string | null;
  readonly finalizedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface KeptApi {
  listGoals(): Promise<readonly GoalDto[]>;
  createGoal(input: {
    readonly name: string;
    readonly targetAmountAtomic: string;
    readonly targetDate: string | null;
  }): Promise<GoalDto>;
  listCommitments(): Promise<readonly CommitmentDto[]>;
  createCommitment(input: {
    readonly goalId: string;
    readonly definition: { readonly code: string; readonly version: number };
    readonly parameters: Readonly<Record<string, unknown>>;
    readonly epochStart: string;
    readonly epochEnd: string;
    readonly verificationDeadline: string;
  }): Promise<CommitmentDto>;
  activateCommitment(commitment: CommitmentDto): Promise<CommitmentDto>;
  cancelCommitment(commitment: CommitmentDto): Promise<CommitmentDto>;
}

type AccessTokenProvider = () => Promise<string | null>;
type PublicEnvironment = Readonly<Record<string, string | undefined>>;

export function readApiBaseUrl(environment: PublicEnvironment): string | null {
  const configured = environment.VITE_KEPT_API_URL?.trim();
  if (!configured) return null;

  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return configured.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function idempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function apiConsumerError(status: number, code: string, cause?: unknown): ConsumerError {
  if (status === 401 || code === "UNAUTHENTICATED") {
    return new ConsumerError("Your session has expired. Sign in again.", {
      code: "authentication_required",
      cause,
      diagnosticCode: code,
    });
  }
  if (code === "REQUEST_IN_PROGRESS") {
    return new ConsumerError("That request is already being processed. Wait a moment and try again.", {
      code: "request_in_progress",
      cause,
      diagnosticCode: code,
    });
  }
  if (status === 409) {
    return new ConsumerError("That request conflicts with a recent change. Refresh and try again.", {
      code: "request_conflict",
      cause,
      diagnosticCode: code,
    });
  }
  if (status === 404) {
    return new ConsumerError("We couldn't find that item.", {
      code: "not_found",
      cause,
      diagnosticCode: code,
    });
  }
  if (status === 400 || status === 413 || status === 415) {
    return new ConsumerError("Check the information and try again.", {
      code: "validation_failed",
      cause,
      diagnosticCode: code,
    });
  }
  return new ConsumerError("Kept is temporarily unavailable. Try again.", {
    code: "service_unavailable",
    cause,
    diagnosticCode: code,
  });
}

export function createKeptApi(input: {
  readonly baseUrl: string;
  readonly getAccessToken: AccessTokenProvider;
  readonly fetcher?: typeof fetch;
}): KeptApi {
  const fetcher = input.fetcher ?? fetch;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let accessToken: string | null;
    try {
      accessToken = await input.getAccessToken();
    } catch (error) {
      throw new ConsumerError("We couldn't verify your session. Sign in again.", {
        code: "authentication_required",
        cause: error,
      });
    }
    if (!accessToken) {
      throw new ConsumerError("Your session has expired. Sign in again.", {
        code: "authentication_required",
      });
    }

    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${accessToken}`);
    if (init.body) headers.set("content-type", "application/json");

    let response: Response;
    try {
      response = await fetcher(`${input.baseUrl}${path}`, {
        ...init,
        headers,
      });
    } catch (error) {
      throw new ConsumerError("Kept couldn't connect. Check your connection and try again.", {
        code: "connection_failed",
        cause: error,
      });
    }

    if (!response.ok) {
      let code = `HTTP_${response.status}`;
      let responseParseError: unknown;
      try {
        const body = await response.json() as { error?: { code?: string } };
        code = body.error?.code ?? code;
      } catch (error) {
        responseParseError = error;
      }
      throw apiConsumerError(response.status, code, responseParseError);
    }

    try {
      return await response.json() as T;
    } catch (error) {
      throw new ConsumerError("Kept returned an unexpected response. Try again.", {
        code: "service_unavailable",
        cause: error,
      });
    }
  }

  function post<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey() },
      body: JSON.stringify(body),
    });
  }

  return {
    listGoals: () => request<readonly GoalDto[]>("/v1/goals"),
    createGoal: (goal) => post<GoalDto>("/v1/goals", goal),
    listCommitments: () => request<readonly CommitmentDto[]>("/v1/commitments"),
    createCommitment: (commitment) => post<CommitmentDto>("/v1/commitments", commitment),
    activateCommitment: (commitment) => post<CommitmentDto>(`/v1/commitments/${commitment.id}/activate`, {
      expectedVersion: commitment.stateVersion,
    }),
    cancelCommitment: (commitment) => post<CommitmentDto>(`/v1/commitments/${commitment.id}/cancel`, {
      expectedVersion: commitment.stateVersion,
    }),
  };
}
