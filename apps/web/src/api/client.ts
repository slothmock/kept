import { ConsumerError } from "../lib/consumer-error.js";
import {
  createAuthenticatedJsonClient,
  type AccessTokenProvider,
} from "./http-client.js";

import type {
  CommitmentDto,
  GoalAllocationDto,
  GoalDto,
  KeptApi,
  MoonPayOfframpOrderDto,
  MoonPayOfframpUrlDto,
  SavingsMarketStatusDto,
  SavingsPerformanceDto,
  SolanaFundingBalancesDto,
  StagingFaucetDto,
  TransactionDto,
} from "./contracts.js";

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
  const client =
    createAuthenticatedJsonClient({
      baseUrl: input.baseUrl,
      getAccessToken: input.getAccessToken,
      ...(input.fetcher
        ? { fetcher: input.fetcher }
        : {}),
    });

  const { request, post } =
    client;

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
