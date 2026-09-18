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

export function readApiBaseUrl(environment: PublicEnvironment): string {
  const configured = environment.VITE_KEPT_API_URL?.trim();
  return configured || "http://127.0.0.1:3000";
}

function idempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function createKeptApi(input: {
  readonly baseUrl: string;
  readonly getAccessToken: AccessTokenProvider;
  readonly fetcher?: typeof fetch;
}): KeptApi {
  const fetcher = input.fetcher ?? fetch;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const accessToken = await input.getAccessToken();
    if (!accessToken) {
      throw new Error("Your Kept session is not authenticated.");
    }

    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${accessToken}`);
    if (init.body) headers.set("content-type", "application/json");

    const response = await fetcher(`${input.baseUrl}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      let code = `HTTP_${response.status}`;
      try {
        const body = await response.json() as { error?: { code?: string } };
        code = body.error?.code ?? code;
      } catch {
        // Keep the HTTP status as the fallback error code.
      }
      throw new Error(`Kept API request failed: ${code}`);
    }

    return response.json() as Promise<T>;
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
