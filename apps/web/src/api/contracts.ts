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

export type DashboardSavingsPerformanceResult =
  | {
      readonly kind: "ready";
      readonly data: SavingsPerformanceDto;
    }
  | {
      readonly kind: "synchronizing";
      readonly progressPercent: number | null;
    }
  | {
      readonly kind: "error";
    };

export type DashboardSavingsMarketStatusResult =
  | {
      readonly kind: "ready";
      readonly data: SavingsMarketStatusDto;
    }
  | {
      readonly kind: "error";
    };

export interface DashboardDto {
  readonly goals: readonly GoalDto[];
  readonly commitments: readonly CommitmentDto[];
  readonly allocations: Readonly<Record<string, GoalAllocationDto>>;
  readonly savings: {
    readonly performance: DashboardSavingsPerformanceResult;
    readonly marketStatus: DashboardSavingsMarketStatusResult;
  };
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

export interface GoalActivityDto {
  readonly id: string;
  readonly eventId: string;
  readonly kind: "ADDED" | "REMOVED";
  readonly shareDeltaAtomic: string;
  readonly createdAt: string;
}

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
  readonly externalReference: string | null;
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
  getDashboard(): Promise<DashboardDto>;
  getSavingsPerformance(): Promise<SavingsPerformanceDto>;
  getSavingsMarketStatus(): Promise<SavingsMarketStatusDto>;
  claimStagingFaucet(): Promise<StagingFaucetDto>;
  getSolanaFundingBalances(
    owner: string,
  ): Promise<SolanaFundingBalancesDto>;
  listTransactions(): Promise<readonly TransactionDto[]>;
  listGoalActivity(goalId: string): Promise<readonly GoalActivityDto[]>;
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
