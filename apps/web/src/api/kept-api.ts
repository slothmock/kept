import { ConsumerError } from "../lib/consumer-error.js";

export type GoalStatus = "ACTIVE" | "COMPLETED" | "ARCHIVED";

export type CommitmentState =
  "DRAFT" | "ACTIVE" | "COMPLETED" | "FAILED" | "CANCELLED";

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
  readonly onchainCommitmentId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SavingsPerformanceDto {
  readonly depositedAssetsAtomic: string;
  readonly withdrawnAssetsAtomic: string;
  readonly netContributionsAtomic: string;
  readonly currentAssetsAtomic: string;
  readonly earningsAssetsAtomic: string;
}

export interface SavingsMarketStatusDto {
  readonly tvlAssetsAtomic: string;
  readonly suppliedAssetsAtomic: string | null;
  readonly supplyCapAssetsAtomic: string | null;
  readonly availableToDepositAtomic: string;
  readonly availableToWithdrawAtomic: string;
  readonly grossApyBps: string;
  readonly netApyBps: string;
}

export interface CreateCommitmentRequest {
  readonly goalId: string;
  readonly definition: { readonly code: string; readonly version: number };
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly epochStart: string;
  readonly epochEnd: string;
  readonly verificationDeadline: string;
}

export interface GoalAllocationDto {
  readonly goalId: string;
  readonly allocatedSharesAtomic: string;
  readonly totalVaultSharesAtomic: string;
  readonly totalAllocatedSharesAtomic: string;
  readonly unallocatedSharesAtomic: string;
}

export interface ReallocateGoalSharesInput {
  readonly fromGoalId: string;
  readonly toGoalId: string;
  readonly shareAmountAtomic: string;
}

export type TransactionType =
  | "fiat_funding"
  | "crypto_funding"
  | "savings_deposit"
  | "savings_withdrawal"
  | "crypto_withdrawal"
  | "fiat_withdrawal"
  | "reward";

export type TransactionStatus =
  | "pending"
  | "completed"
  | "failed";

export interface TransactionDto {
  readonly id: string;
  readonly type: TransactionType;
  readonly status: TransactionStatus;
  readonly amountAtomic: string;
  readonly asset: string;
  readonly description: string;
  readonly goalId: string | null;
  readonly chainId: string | null;
  readonly transactionHash: string | null;
  readonly createdAt: string;
}

export interface RecordTransactionInput {
  readonly type:
  | "SAVINGS_DEPOSIT"
  | "SAVINGS_WITHDRAWAL"
  | "CRYPTO_WITHDRAWAL"
  | "FIAT_WITHDRAWAL";

  readonly amountAtomic: string;
  readonly asset: string;
  readonly description: string;
  readonly goalId?: string | null;
  readonly chainId?: string | null;
  readonly transactionHash?: string | null;
  readonly externalReference?: string | null;
}

export type MoonPayOfframpOrderStatus =
  | "pending_widget"
  | "awaiting_deposit_details"
  | "ready"
  | "funds_sent"
  | "completed"
  | "failed"
  | "cancelled";

export interface MoonPayOfframpOrderDto {
  readonly id: string;
  readonly amountAtomic: string;
  readonly baseCurrencyCode: string;
  readonly moonPayTransactionId: string | null;
  readonly depositWalletAddress: string | null;
  readonly depositWalletTag: string | null;
  readonly transferReference: string | null;
  readonly fundsSentAt: string | null;
  readonly status: MoonPayOfframpOrderStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MoonPayOfframpUrlDto {
  readonly url: string;
  readonly orderId: string;
}

export interface StagingFaucetDto {
  readonly amountAtomic: string;
  readonly transactionHash: string;
}

export interface SolanaFundingBalancesDto {
  readonly nativeBalance: string;
  readonly balances: Readonly<Record<string, string>>;
}

export interface KeptApi {
  getSavingsPerformance(): Promise<SavingsPerformanceDto>;
  getSavingsMarketStatus(): Promise<SavingsMarketStatusDto>;
  claimStagingFaucet(): Promise<StagingFaucetDto>;
  getSolanaFundingBalances(
    owner: string,
  ): Promise<SolanaFundingBalancesDto>;
  listTransactions(): Promise<readonly TransactionDto[]>;
  recordTransaction(
    input: RecordTransactionInput,
    idempotencyKey?: string,
  ): Promise<TransactionDto>;
  readonly createMoonPayOfframpUrl:
  (amount: string) => Promise<MoonPayOfframpUrlDto>;
  readonly getMoonPayOfframpOrder:
  (orderId: string) => Promise<MoonPayOfframpOrderDto>;
  readonly markMoonPayOfframpFundsSent:
  (orderId: string, transferReference: string) => Promise<MoonPayOfframpOrderDto>;
  listGoals(): Promise<readonly GoalDto[]>;
  createGoal(input: {
    readonly name: string;
    readonly targetAmountAtomic: string;
    readonly targetDate: string | null;
  }): Promise<GoalDto>;
  archiveGoal(goalId: string, idempotencyKey?: string): Promise<GoalDto>;
  getGoalAllocation(goalId: string): Promise<GoalAllocationDto>;
  allocateGoalShares(
    goalId: string,
    input: { readonly shareDeltaAtomic: string; readonly reason: string },
    idempotencyKey?: string,
  ): Promise<GoalAllocationDto>;
  reallocateGoalShares(
    input: ReallocateGoalSharesInput,
    idempotencyKey?: string,
  ): Promise<{
    readonly from: GoalAllocationDto;
    readonly to: GoalAllocationDto;
  }>;
  listCommitments(): Promise<readonly CommitmentDto[]>;
  createCommitment(
    input: CreateCommitmentRequest,
    idempotencyKey?: string,
  ): Promise<CommitmentDto>;
  activateCommitment(
    commitment: CommitmentDto,
    settlement: {
      readonly onchainCommitmentId: string;
      readonly transactionHash: string;
    },
  ): Promise<CommitmentDto>;
  cancelCommitment(
    commitment: CommitmentDto,
    settlement: {
      readonly onchainCommitmentId: string;
      readonly owner: string;
    },
  ): Promise<CommitmentDto>;
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

function apiConsumerError(
  status: number,
  code: string,
  cause?: unknown,
  metadata?: {
    readonly progressPercent?: number | null;
  },
): ConsumerError {
  if (status === 401 || code === "UNAUTHENTICATED") {
    return new ConsumerError("Your session has expired. Sign in again.", {
      code: "authentication_required",
      cause,
      diagnosticCode: code,
    });
  }

  if (code === "REQUEST_IN_PROGRESS") {
    return new ConsumerError(
      "That request is already being processed. Wait a moment and try again.",
      {
        code: "request_in_progress",
        cause,
        diagnosticCode: code,
      },
    );
  }

  if (code === "SAVINGS_HISTORY_SYNCHRONIZING") {
    return new ConsumerError(
      "Savings history is synchronising.",
      {
        code: "synchronizing",
        cause,
        diagnosticCode: code,
        ...(metadata?.progressPercent !== undefined
          ? {
              progressPercent:
                metadata.progressPercent,
            }
          : {}),
      },
    );
  }

  if (code === "RPC_RATE_LIMITED") {
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

function parseGoalAllocation(
  value: unknown,
  expectedGoalId: string,
): GoalAllocationDto {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ConsumerError(
      "Kept returned an unexpected response. Try again.",
      {
        code: "service_unavailable",
      },
    );
  }

  const record = value as Record<string, unknown>;
  const atomicFields = [
    "allocatedSharesAtomic",
    "totalVaultSharesAtomic",
    "totalAllocatedSharesAtomic",
    "unallocatedSharesAtomic",
  ] as const;

  if (
    record.goalId !== expectedGoalId ||
    atomicFields.some(
      (field) =>
        typeof record[field] !== "string" ||
        !/^-?\d+$/.test(record[field] as string),
    )
  ) {
    throw new ConsumerError(
      "Kept returned an unexpected response. Try again.",
      {
        code: "service_unavailable",
      },
    );
  }

  return {
    goalId: record.goalId,
    allocatedSharesAtomic: record.allocatedSharesAtomic as string,
    totalVaultSharesAtomic: record.totalVaultSharesAtomic as string,
    totalAllocatedSharesAtomic: record.totalAllocatedSharesAtomic as string,
    unallocatedSharesAtomic: record.unallocatedSharesAtomic as string,
  };
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
      throw new ConsumerError(
        "We couldn't verify your session. Sign in again.",
        {
          code: "authentication_required",

          cause: error,
        },
      );
    }

    if (!accessToken) {
      throw new ConsumerError("Your session has expired. Sign in again.", {
        code: "authentication_required",
      });
    }

    const headers = new Headers(init.headers);

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
      ) ||
      apiUrl.hostname.endsWith(
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
      response = await fetcher(`${input.baseUrl}${path}`, {
        ...init,
        headers,
      });
    } catch (error) {
      throw new ConsumerError(
        "Kept couldn't connect. Check your connection and try again.",
        {
          code: "connection_failed",
          cause: error,
        },
      );
    }

    if (!response.ok) {
      let code = `HTTP_${response.status}`;
      let responseParseError: unknown;

      let progressPercent: number | null | undefined;

      try {
        const body = (await response.json()) as {
          error?: {
            code?: string;
            progressPercent?: number | null;
          };
        };

        code = body.error?.code ?? code;

        progressPercent =
          typeof body.error?.progressPercent === "number"
            ? body.error.progressPercent
            : body.error?.progressPercent === null
              ? null
              : undefined;
      } catch (error) {
        responseParseError = error;
      }

      throw apiConsumerError(
        response.status,
        code,
        responseParseError,
        progressPercent !== undefined
          ? {
              progressPercent,
            }
          : undefined,
      );
    }

    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new ConsumerError(
        "Kept returned an unexpected response. Try again.",
        {
          code: "service_unavailable",
          cause: error,
        },
      );
    }
  }

  function post<T>(
    path: string,
    body: unknown,
    requestIdempotencyKey = idempotencyKey(),
  ): Promise<T> {
    return request<T>(path, {
      method: "POST",
      headers: { "idempotency-key": requestIdempotencyKey },
      body: JSON.stringify(body),
    });
  }

  return {
    getSavingsPerformance: () =>
      request<SavingsPerformanceDto>("/v1/savings/performance"),
    getSavingsMarketStatus: () =>
      request<SavingsMarketStatusDto>("/v1/savings/market-status"),
    claimStagingFaucet: () =>
      post<StagingFaucetDto>("/v1/staging/faucet", {}),
    getSolanaFundingBalances: (owner) =>
      post<SolanaFundingBalancesDto>(
        "/v1/funding/solana/token-balances",
        { owner },
      ),
    listTransactions: () => request<readonly TransactionDto[]>("/v1/account/transactions"),
    recordTransaction: (
      transaction,
      requestIdempotencyKey,
    ) =>
      post<TransactionDto>(
        "/v1/account/transactions",
        transaction,
        requestIdempotencyKey,
      ),
    listGoals: () => request<readonly GoalDto[]>("/v1/goals"),
    createMoonPayOfframpUrl: (amount) =>
      post<MoonPayOfframpUrlDto>(
        "/v1/moonpay/offramp-url",
        { amount },
      ),
    getMoonPayOfframpOrder: (orderId) =>
      request<MoonPayOfframpOrderDto>(
        `/v1/moonpay/offramp-orders/${encodeURIComponent(orderId)}`,
      ),
    markMoonPayOfframpFundsSent: (orderId, transferReference) =>
      post<MoonPayOfframpOrderDto>(
        `/v1/moonpay/offramp-orders/${encodeURIComponent(orderId)}/submitted`,
        { transferReference },
      ),
    createGoal: (goal) => post<GoalDto>("/v1/goals", goal),
    archiveGoal: (
      goalId,
      requestIdempotencyKey,
    ) =>
      post<GoalDto>(
        `/v1/goals/${encodeURIComponent(goalId)}/archive`,
        {},
        requestIdempotencyKey,
      ),
    getGoalAllocation: async (goalId) =>
      parseGoalAllocation(
        await request<unknown>(
          `/v1/goals/${encodeURIComponent(goalId)}/allocation`,
        ),
        goalId,
      ),
    allocateGoalShares: async (goalId, allocation, requestIdempotencyKey) =>
      parseGoalAllocation(
        await post<unknown>(
          `/v1/goals/${encodeURIComponent(goalId)}/allocations`,
          { ...allocation },
          requestIdempotencyKey,
        ),
        goalId,
      ),
    reallocateGoalShares: async (
      input,
      requestIdempotencyKey,
    ) => {
      const result = await post<{
        readonly from: unknown;
        readonly to: unknown;
      }>(
        "/v1/goals/reallocate",
        input,
        requestIdempotencyKey,
      );
      return {
        from: parseGoalAllocation(
          result.from,
          input.fromGoalId,
        ),
        to: parseGoalAllocation(
          result.to,
          input.toGoalId,
        ),
      };
    },
    listCommitments: () => request<readonly CommitmentDto[]>("/v1/commitments"),
    createCommitment: (commitment, requestIdempotencyKey) =>
      post<CommitmentDto>(
        "/v1/commitments",

        commitment,

        requestIdempotencyKey,
      ),

    activateCommitment: (commitment, settlement) =>
      post<CommitmentDto>(`/v1/commitments/${commitment.id}/activate`, {
        expectedVersion: commitment.stateVersion,

        ...settlement,
      }),

    cancelCommitment: (commitment, settlement) =>
      post<CommitmentDto>(`/v1/commitments/${commitment.id}/cancel`, {
        expectedVersion: commitment.stateVersion,

        ...settlement,
      }),
  };
}
