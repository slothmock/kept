import { createHash, randomUUID } from "node:crypto";

import {
  getCommitmentDefinition,
  validateCommitmentParameters,
} from "@kept/commitment-catalogue";

import type { KeptDatabase } from "../db/client.js";
import { assertAllocationCutoverParity } from "../domain/allocation-cutover.js";
import { AllocationLedgerStore } from "./allocation-ledger-store.js";
import {
  decodeOnchainCommitmentId,
  encodeOnchainCommitmentId,
} from "../commitment-settlement.js";
import {
  createCommitment,
  StaleCommitmentVersionError,
  transitionCommitment,
  type JsonValue,
} from "../domain/commitments/index.js";
import {
  IdempotencyConflictError,
  IncompleteIdempotencyRecordError,
  NotFoundError,
  PersistenceValidationError,
} from "./errors.js";
import { type CommitmentRecord, KeptRepository } from "./repository.js";
import type { VaultShareBalanceReader } from "../vault-shares.js";

const IDEMPOTENCY_TTL_MILLISECONDS = 24 * 60 * 60 * 1_000;

export interface UserDto {
  readonly id: string;
  readonly privyUserId: string;
  readonly displayName: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WalletDto {
  readonly id: string;
  readonly userId: string;
  readonly privyWalletId: string | null;
  readonly walletKind: string;
  readonly chainId: string | null;
  readonly address: string;
  readonly isPrimary: boolean;
  readonly createdAt: string;
}

export interface GoalDto {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly targetAmountAtomic: string;
  readonly targetAsset: string;
  readonly targetDate: string | null;
  readonly status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
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
  readonly parameters: Readonly<Record<string, JsonValue>>;
  readonly epochStart: string;
  readonly epochEnd: string;
  readonly verificationDeadline: string;
  readonly state: CommitmentRecord["state"];
  readonly stateVersion: number;
  readonly onchainCommitmentId: string | null;
  readonly activatedAt: string | null;
  readonly finalizedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface GoalAllocationDto {
  readonly goalId: string;
  readonly allocatedSharesAtomic: string;
  readonly totalVaultSharesAtomic: string;
  readonly totalAllocatedSharesAtomic: string;
  readonly unallocatedSharesAtomic: string;
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

export interface TransactionDto {
  readonly id: string;
  readonly type: TransactionType;
  readonly status: TransactionStatus;
  readonly amountAtomic: string;
  readonly asset: string;
  readonly description: string;
  readonly goalId: string | null;
  readonly chainId: string | null;
  readonly transactionHash:
  | string
  | null;

  readonly externalReference:
  | string
  | null;

  readonly createdAt: string;
}

function requireNonBlank(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new PersistenceValidationError(`${field} must not be blank`);
  }
  return trimmed;
}

function requireAtomicAmount(value: string): string {
  if (!/^\d{1,78}$/.test(value)) {
    throw new PersistenceValidationError(
      "targetAmountAtomic must be a non-negative integer with at most 78 digits",
    );
  }
  return value;
}

function requireSignedAtomicShareDelta(value: string): bigint {
  if (!/^-?\d{1,78}$/.test(value)) {
    throw new PersistenceValidationError(
      "shareDeltaAtomic must be a signed integer with at most 78 digits",
    );
  }
  const delta = BigInt(value);
  if (delta === 0n) throw new PersistenceValidationError("shareDeltaAtomic must not be zero");
  return delta;
}

function parseTimestamp(value: string, field: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new PersistenceValidationError(`${field} must be a valid timestamp`);
  }
  return parsed;
}

function validateCatalogueReference(
  definition: { readonly code: string; readonly version: number },
  parameters: Readonly<Record<string, JsonValue>>,
): Readonly<Record<string, JsonValue>> {
  const catalogueDefinition = getCommitmentDefinition(definition.code);
  if (!catalogueDefinition || catalogueDefinition.version !== definition.version) {
    throw new PersistenceValidationError("Unknown commitment definition version");
  }

  const validation = validateCommitmentParameters(definition.code, parameters);
  if (!validation.valid) {
    throw new PersistenceValidationError(validation.issues.join("; "));
  }

  return validation.value as unknown as Readonly<Record<string, JsonValue>>;
}

function validateCommitmentWindow(
  parameters: Readonly<Record<string, JsonValue>>,
  epochStart: Date,
  epochEnd: Date,
  verificationDeadline: Date,
  commitmentWindowOverrideSeconds?: number,
): void {
  if (
    epochEnd <= epochStart
    || verificationDeadline < epochEnd
  ) {
    throw new PersistenceValidationError(
      "Commitment period timestamps are out of order",
    );
  }

  const periodDays =
    parameters.periodDays;

  if (
    !Number.isSafeInteger(periodDays)
    || typeof periodDays !== "number"
    || periodDays < 1
  ) {
    throw new PersistenceValidationError(
      "Commitment periodDays must be a positive safe integer",
    );
  }

  const expectedDurationMilliseconds =
    commitmentWindowOverrideSeconds !== undefined
      ? commitmentWindowOverrideSeconds * 1_000
      : periodDays * 24 * 60 * 60 * 1_000;

  if (
    epochEnd.getTime()
    - epochStart.getTime()
    !== expectedDurationMilliseconds
  ) {
    throw new PersistenceValidationError(
      "Commitment window must match the catalogue period",
    );
  }
}

function requireDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new PersistenceValidationError("targetDate must use YYYY-MM-DD format");
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new PersistenceValidationError("targetDate must be a valid calendar date");
  }
  return value;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  throw new PersistenceValidationError("Idempotent command payload must be JSON-compatible");
}

function hashRequest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function mapUser(row: {
  id: string;
  privyUserId: string;
  displayName: string | null;
  createdAt: Date;
  updatedAt: Date;
}): UserDto {
  return {
    id: row.id,
    privyUserId: row.privyUserId,
    displayName: row.displayName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapWallet(row: {
  id: string;
  userId: string;
  privyWalletId: string | null;
  walletKind: string;
  chainId: bigint | null;
  address: string;
  isPrimary: boolean;
  createdAt: Date;
}): WalletDto {
  return {
    id: row.id,
    userId: row.userId,
    privyWalletId: row.privyWalletId,
    walletKind: row.walletKind,
    chainId: row.chainId?.toString() ?? null,
    address: row.address,
    isPrimary: row.isPrimary,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapGoal(row: {
  id: string;
  userId: string;
  name: string;
  targetAmountAtomic: string;
  targetAsset: string;
  targetDate: string | null;
  status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  createdAt: Date;
  updatedAt: Date;
}): GoalDto {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    targetAmountAtomic: row.targetAmountAtomic,
    targetAsset: row.targetAsset,
    targetDate: row.targetDate,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapCommitment(row: CommitmentRecord): CommitmentDto {
  return {
    id: row.id,
    userId: row.userId,
    savingsGoalId: row.savingsGoalId,
    definition: {
      code: row.definitionCode,
      version: row.definitionVersion,
    },
    parameters: structuredClone(row.parameters),
    epochStart: row.epochStart.toISOString(),
    epochEnd: row.epochEnd.toISOString(),
    verificationDeadline: row.verificationDeadline.toISOString(),
    state: row.state,
    stateVersion: row.stateVersion,
    onchainCommitmentId: row.opaqueSettlementRef
      ? decodeOnchainCommitmentId(row.opaqueSettlementRef)
      : null,
    activatedAt: row.activatedAt?.toISOString() ?? null,
    finalizedAt: row.finalizedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type AccountTransactionRow = {
  readonly id: string;

  readonly userId: string;

  readonly goalId: string | null;

  readonly type:
  | "FIAT_FUNDING"
  | "CRYPTO_FUNDING"
  | "SAVINGS_DEPOSIT"
  | "SAVINGS_WITHDRAWAL"
  | "CRYPTO_WITHDRAWAL"
  | "FIAT_WITHDRAWAL"
  | "REWARD";

  readonly status:
  | "PENDING"
  | "COMPLETED"
  | "FAILED";

  readonly amountAtomic: string;

  readonly asset: string;

  readonly description: string;

  readonly chainId:
  | bigint
  | null;

  readonly transactionHash:
  | string
  | null;

  readonly externalReference:
  | string
  | null;

  readonly createdAt: Date;

  readonly updatedAt: Date;
};

function mapTransactionType(
  type: AccountTransactionRow["type"],
): TransactionType {
  switch (type) {
    case "FIAT_FUNDING":
      return "fiat_funding";

    case "CRYPTO_FUNDING":
      return "crypto_funding";

    case "SAVINGS_DEPOSIT":
      return "savings_deposit";

    case "SAVINGS_WITHDRAWAL":
      return "savings_withdrawal";

    case "CRYPTO_WITHDRAWAL":
      return "crypto_withdrawal";

    case "FIAT_WITHDRAWAL":
      return "fiat_withdrawal";

    case "REWARD":
      return "reward";
  }
}

function mapTransactionStatus(
  status:
    AccountTransactionRow["status"],
): TransactionStatus {
  switch (status) {
    case "PENDING":
      return "pending";

    case "COMPLETED":
      return "completed";

    case "FAILED":
      return "failed";
  }
}

function mapTransaction(
  row: AccountTransactionRow,
): TransactionDto {
  return {
    id: row.id,
    type: mapTransactionType(row.type),
    status: mapTransactionStatus(row.status),
    amountAtomic: row.amountAtomic,
    asset: row.asset,
    description: row.description,

    goalId:
      row.goalId,
    chainId: row.chainId?.toString() ?? null,

    transactionHash: row.transactionHash,
    externalReference: row.externalReference,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapMoonPayOfframpOrder(row: {
  id: string;
  amountAtomic: string;
  baseCurrencyCode: string;
  moonPayTransactionId: string | null;
  depositWalletAddress: string | null;
  depositWalletTag: string | null;
  transferReference: string | null;
  fundsSentAt: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): MoonPayOfframpOrderDto {
  const status: MoonPayOfframpOrderStatus =
    row.status === "PENDING_WIDGET"
      ? "pending_widget"
      : row.status === "AWAITING_DEPOSIT_DETAILS"
        ? "awaiting_deposit_details"
        : row.status === "READY"
          ? "ready"
          : row.status === "FUNDS_SENT"
            ? "funds_sent"
            : row.status === "COMPLETED"
              ? "completed"
              : row.status === "CANCELLED"
                ? "cancelled"
                : "failed";

  return {
    id: row.id,
    amountAtomic: row.amountAtomic,
    baseCurrencyCode: row.baseCurrencyCode,
    moonPayTransactionId: row.moonPayTransactionId,
    depositWalletAddress: row.depositWalletAddress,
    depositWalletTag: row.depositWalletTag,
    transferReference: row.transferReference,
    fundsSentAt: row.fundsSentAt?.toISOString() ?? null,
    status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface KeptPersistenceOptions {
  readonly chainId?: bigint;
  readonly reader?: VaultShareBalanceReader;
  readonly commitmentWindowOverrideSeconds?: number;
}

function normalizeWaitlistEmail(
  value: string,
): string {
  const email =
    value
      .trim()
      .toLowerCase();

  if (
    email.length < 3
    || email.length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email,
    )
  ) {
    throw new PersistenceValidationError(
      "email must be a valid email address",
    );
  }

  return email;
}

export class KeptPersistenceService {
  constructor(
    private readonly db: KeptDatabase,
    private readonly vaultShares?: {
      readonly reader: VaultShareBalanceReader;
      readonly chainId: bigint;
    },
    private readonly commitmentWindowOverrideSeconds?: number,
  ) { }

  async joinWaitlist(input: {
    readonly email: string;
  }): Promise<void> {
    await new KeptRepository(
      this.db,
    ).joinWaitlist({
      id: randomUUID(),
      email:
        normalizeWaitlistEmail(
          input.email,
        ),
      now: new Date(),
    });
  }

  async createUser(input: {
    readonly privyUserId: string;
    readonly displayName?: string | null;
  }): Promise<UserDto> {
    const now = new Date();
    const repository = new KeptRepository(this.db);
    const user = await repository.createUser({
      id: randomUUID(),
      privyUserId: input.privyUserId,
      displayName: input.displayName?.trim() || null,
      now,
    });
    if (!user) {
      throw new Error("User insert did not return a record");
    }
    return mapUser(user);
  }

  async getUser(id: string): Promise<UserDto | null> {
    const user = await new KeptRepository(this.db).findUser(id);
    return user ? mapUser(user) : null;
  }

  async createWallet(input: {
    readonly userId: string;
    readonly privyWalletId?: string | null;
    readonly walletKind: string;
    readonly chainId?: string | null;
    readonly address: string;
    readonly isPrimary: boolean;
  }): Promise<WalletDto> {
    const repository = new KeptRepository(this.db);
    if (!(await repository.findUser(input.userId))) {
      throw new NotFoundError("User");
    }

    let chainId: bigint | null = null;
    if (input.chainId !== undefined && input.chainId !== null) {
      try {
        chainId = BigInt(input.chainId);
      } catch {
        throw new PersistenceValidationError("chainId must be an integer");
      }
      if (chainId < 0n) {
        throw new PersistenceValidationError("chainId must not be negative");
      }
      if (chainId > 9_223_372_036_854_775_807n) {
        throw new PersistenceValidationError("chainId exceeds PostgreSQL BIGINT range");
      }
    }

    const wallet = await repository.createWallet({
      id: randomUUID(),
      userId: input.userId,
      privyWalletId: input.privyWalletId ?? null,
      walletKind: requireNonBlank(input.walletKind, "walletKind"),
      chainId,
      address: requireNonBlank(input.address, "address"),
      isPrimary: input.isPrimary,
      createdAt: new Date(),
    });
    if (!wallet) {
      throw new Error("Wallet insert did not return a record");
    }
    return mapWallet(wallet);
  }

  async getWallet(userId: string, id: string): Promise<WalletDto | null> {
    const wallet = await new KeptRepository(this.db).findWalletForOwner(userId, id);
    return wallet ? mapWallet(wallet) : null;
  }

  async ensureEmbeddedWallet(input: {
    readonly userId: string;
    readonly chainId: number;
    readonly address: string;
  }): Promise<WalletDto> {
    if (!Number.isSafeInteger(input.chainId) || input.chainId <= 0) {
      throw new PersistenceValidationError(
        "chainId must be a positive safe integer",
      );
    }

    const repository = new KeptRepository(this.db);
    const chainId = BigInt(input.chainId);
    const address = requireNonBlank(input.address, "address");

    if (!(await repository.findUser(input.userId))) {
      throw new NotFoundError("User");
    }

    const primary =
      await repository.findPrimaryWalletForOwnerOnChain(
        input.userId,
        chainId,
      );

    if (primary) {
      if (
        primary.address.toLowerCase()
        !== address.toLowerCase()
      ) {
        throw new PersistenceValidationError(
          "Authenticated embedded wallet does not match the stored wallet",
        );
      }

      return mapWallet(primary);
    }

    const existing =
      await repository.findWalletByChainAddress(
        chainId,
        address,
      );

    if (existing) {
      if (existing.userId !== input.userId) {
        throw new PersistenceValidationError(
          "The wallet is already associated with another account",
        );
      }

      const updated = await repository.updateWallet({
        id: existing.id,
        walletKind: "PRIVY_EMBEDDED_MONAD",
        isPrimary: true,
      });

      if (!updated) {
        throw new Error(
          "Embedded wallet could not be updated",
        );
      }

      return mapWallet(updated);
    }

    const created = await repository.createWallet({
      id: randomUUID(),
      userId: input.userId,
      privyWalletId: null,
      walletKind: "PRIVY_EMBEDDED_MONAD",
      chainId,
      address,
      isPrimary: true,
      createdAt: new Date(),
    });

    if (!created) {
      throw new Error(
        "Embedded wallet could not be created",
      );
    }

    return mapWallet(created);
  }

  async createMoonPayOfframpOrder(input: {
    readonly userId: string;
    readonly amountAtomic: string;
  }): Promise<MoonPayOfframpOrderDto> {
    const amountAtomic = requireAtomicAmount(input.amountAtomic);
    if (BigInt(amountAtomic) <= 0n) {
      throw new PersistenceValidationError("amountAtomic must be greater than zero");
    }

    const repository = new KeptRepository(this.db);
    if (!(await repository.findUser(input.userId))) {
      throw new NotFoundError("User");
    }

    const now = new Date();
    const order = await repository.createMoonPayOfframpOrder({
      id: randomUUID(),
      userId: input.userId,
      amountAtomic,
      baseCurrencyCode: "usdc_base",
      status: "PENDING_WIDGET",
      createdAt: now,
      updatedAt: now,
    });

    if (!order) {
      throw new Error("MoonPay off-ramp order insert did not return a record");
    }

    return mapMoonPayOfframpOrder(order);
  }

  async getMoonPayOfframpOrder(
    userId: string,
    id: string,
  ): Promise<MoonPayOfframpOrderDto | null> {
    const order = await new KeptRepository(this.db)
      .findMoonPayOfframpOrderForOwner(userId, id);

    return order ? mapMoonPayOfframpOrder(order) : null;
  }

  async recordMoonPayOfframpWebhook(input: {
    readonly orderId: string;
    readonly moonPayTransactionId: string;
    readonly baseCurrencyCode: string;
    readonly depositWalletAddress: string | null;
    readonly depositWalletTag?: string | null;
    readonly status?: "ready" | "completed" | "failed" | "cancelled";
  }): Promise<MoonPayOfframpOrderDto> {
    if (requireNonBlank(input.baseCurrencyCode, "baseCurrencyCode") !== "usdc_base") {
      throw new PersistenceValidationError("MoonPay off-ramp asset must be Base USDC");
    }

    const orderId = requireNonBlank(input.orderId, "orderId");
    const moonPayTransactionId = requireNonBlank(
      input.moonPayTransactionId,
      "moonPayTransactionId",
    );
    const status = input.status ?? "ready";
    const depositWalletAddress =
      input.depositWalletAddress?.trim() || null;

    if (
      status === "ready"
      && !depositWalletAddress
    ) {
      throw new PersistenceValidationError(
        "depositWalletAddress must not be blank for a ready MoonPay order",
      );
    }

    const now = new Date();

    return this.db.transaction(async (transaction) => {
      const repository = new KeptRepository(transaction);
      const order = await repository.updateMoonPayOfframpOrderFromWebhook({
        id: orderId,
        moonPayTransactionId,
        baseCurrencyCode: "usdc_base",
        depositWalletAddress,
        depositWalletTag: input.depositWalletTag?.trim() || null,
        status,
        now,
      });

      if (!order) {
        throw new NotFoundError("MoonPay off-ramp order");
      }

      const transactionStatus =
        status === "completed"
          ? "COMPLETED"
          : status === "failed" || status === "cancelled"
            ? "FAILED"
            : null;

      if (transactionStatus) {
        await repository.updateMoonPayFiatWithdrawalTransactionStatus({
          userId: order.userId,
          externalReference: moonPayTransactionId,
          status: transactionStatus,
          now,
        });
      }

      return mapMoonPayOfframpOrder(order);
    });
  }

  async markMoonPayOfframpFundsSent(input: {
    readonly userId: string;
    readonly orderId: string;
    readonly transferReference: string;
  }): Promise<MoonPayOfframpOrderDto> {
    const userId = requireNonBlank(input.userId, "userId");
    const orderId = requireNonBlank(input.orderId, "orderId");
    const transferReference = requireNonBlank(
      input.transferReference,
      "transferReference",
    );
    const now = new Date();

    return this.db.transaction(async (transaction) => {
      const repository = new KeptRepository(transaction);
      const order = await repository.markMoonPayOfframpFundsSent({
        userId,
        id: orderId,
        transferReference,
        now,
      });

      if (!order || !order.moonPayTransactionId) {
        throw new NotFoundError("MoonPay off-ramp order");
      }

      const transactionStatus =
        order.status === "COMPLETED"
          ? "COMPLETED"
          : order.status === "FAILED" || order.status === "CANCELLED"
            ? "FAILED"
            : "PENDING";

      const fiatTransaction =
        await repository.ensureMoonPayFiatWithdrawalTransaction({
          id: randomUUID(),
          userId,
          amountAtomic: order.amountAtomic,
          externalReference: order.moonPayTransactionId,
          status: transactionStatus,
          now,
        });

      if (!fiatTransaction) {
        throw new Error(
          "MoonPay fiat withdrawal transaction could not be persisted",
        );
      }

      if (
        transactionStatus !== "PENDING"
        && fiatTransaction.status !== transactionStatus
      ) {
        await repository.updateMoonPayFiatWithdrawalTransactionStatus({
          userId,
          externalReference: order.moonPayTransactionId,
          status: transactionStatus,
          now,
        });
      }

      return mapMoonPayOfframpOrder(order);
    });
  }

  async createGoal(input: {
    readonly userId: string;
    readonly idempotencyKey: string;
    readonly name: string;
    readonly targetAmountAtomic: string;
    readonly targetDate: string | null;
  }): Promise<GoalDto> {
    const { idempotencyKey, ...request } = input;
    return this.executeIdempotent(input.userId, "goal:create", idempotencyKey, request, async (repository) => {
      if (!(await repository.findUser(input.userId))) {
        throw new NotFoundError("User");
      }
      const now = new Date();
      const goal = await repository.createGoal({
        id: randomUUID(),
        userId: input.userId,
        name: requireNonBlank(input.name, "name"),
        targetAmountAtomic: requireAtomicAmount(input.targetAmountAtomic),
        targetAsset: "USDC",
        targetDate: input.targetDate === null ? null : requireDate(input.targetDate),
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      });
      if (!goal) {
        throw new Error("Goal insert did not return a record");
      }
      return mapGoal(goal);
    });
  }

  async getGoal(userId: string, id: string): Promise<GoalDto | null> {
    const goal = await new KeptRepository(this.db).findGoalForOwner(userId, id);
    return goal ? mapGoal(goal) : null;
  }

  async listGoals(userId: string): Promise<readonly GoalDto[]> {
    const goals = await new KeptRepository(this.db).listGoalsForOwner(userId);
    return goals.map(mapGoal);
  }

  async listTransactions(userId: string):
    Promise<readonly TransactionDto[]> {
    const transactions = await new KeptRepository(this.db)
      .listAccountTransactionsForOwner(userId);

    return transactions.map(mapTransaction);
  }

  async recordTransaction(input: {
    readonly userId: string;
    readonly idempotencyKey: string;
    readonly goalId?: string | null;
    readonly type: AccountTransactionRow["type"];
    readonly status?: AccountTransactionRow["status"];
    readonly amountAtomic: string;
    readonly asset: string;
    readonly description: string;
    readonly chainId?: bigint | null;
    readonly transactionHash?: string | null;
    readonly externalReference?: string | null;
  }): Promise<TransactionDto> {
    const request = {
      userId: input.userId,
      goalId: input.goalId ?? null,
      type: input.type,
      status: input.status ?? "COMPLETED",
      amountAtomic: input.amountAtomic,
      asset: input.asset,
      description: input.description,
      chainId: input.chainId?.toString() ?? null,
      transactionHash: input.transactionHash ?? null,
      externalReference: input.externalReference ?? null,
    };

    return this.executeIdempotent(
      input.userId,
      "account-transaction:record",
      input.idempotencyKey,
      request,
      async (repository) => {
        const amountAtomic =
          requireAtomicAmount(
            input.amountAtomic,
          );

        if (
          BigInt(amountAtomic) <= 0n
        ) {
          throw new PersistenceValidationError(
            "transaction amount must be greater than zero",
          );
        }

        if (
          !(await repository.findUser(
            input.userId,
          ))
        ) {
          throw new NotFoundError(
            "User",
          );
        }

        if (
          input.goalId
          && !(
            await repository
              .findGoalForOwner(
                input.userId,
                input.goalId,
              )
          )
        ) {
          throw new NotFoundError(
            "Savings goal",
          );
        }

        const now =
          new Date();

        const transaction =
          await repository
            .createAccountTransaction({
              id: randomUUID(),
              userId: input.userId,
              goalId: input.goalId ?? null,
              type: input.type,
              status: input.status ?? "COMPLETED",
              amountAtomic,
              asset: requireNonBlank(input.asset,
                  "asset",
                ),
              description: requireNonBlank(
                  input.description,
                  "description",
                ),
              chainId: input.chainId ?? null,
              transactionHash: input.transactionHash ?? null,
              externalReference: input.externalReference ?? null,
              createdAt: now,
              updatedAt: now,
            });

        if (!transaction) {
          throw new Error(
            "Transaction insert did not return a record",
          );
        }

        return mapTransaction(transaction);
      },
    );
  }

  /**
   * Reconcile an explicitly initialized account against the live vault in
   * one transaction, alongside legacy goal reductions. Uninitialized accounts
   * remain exclusively on the legacy path.
   */
  async reconcileInitializedGoalLedger(input: {
    readonly userId: string;
    readonly walletAddress: string;
  }): Promise<boolean> {
    const { shares } = await this.readVaultShares(input.walletAddress);
    return this.db.transaction(async transaction => {
      const repository = new KeptRepository(transaction);
      await repository.lockGoalsForOwner(input.userId);
      return this.reconcileGoalAndLedgerInTransaction(transaction, repository, input.userId, shares);
    });
  }

  /**
   * Reconcile legacy allocations and initialized ledger buckets under
   * the caller's existing transaction and user-wide goal lock.
   */
  private async reconcileGoalAndLedgerInTransaction(
    transaction: Parameters<Parameters<KeptDatabase["transaction"]>[0]>[0],
    repository: KeptRepository,
    userId: string,
    shares: bigint,
  ): Promise<boolean> {
    const ledger = new AllocationLedgerStore(this.db);
    const hasOpening = await ledger.hasOpeningInTransaction(transaction, userId);
    if (!hasOpening) {
      await this.reconcileGoalAllocationsToVaultBalance(repository, userId, shares);
      return false;
    }
    const oldRows = await repository.listPositiveGoalAllocationsForOwner(userId);
    const oldBalances = await ledger.getBalancesInTransaction(transaction, userId);
    const beforeTotal = Object.values(oldBalances).reduce((sum, n) => sum + n, 0n);
    assertAllocationCutoverParity({
      hasOpening: true, liveVaultShares: beforeTotal,
      legacyGoalShares: Object.fromEntries(oldRows.map(row => [row.goalId, BigInt(row.allocatedSharesAtomic)])),
      ledgerBalances: oldBalances,
    });
    await this.reconcileGoalAllocationsToVaultBalance(repository, userId, shares);
    await ledger.reconcileToVaultSharesInTransaction(transaction, {
      userId, liveShares: shares, key: `vault-reconciliation:${randomUUID()}`,
    });
    const newRows = await repository.listPositiveGoalAllocationsForOwner(userId);
    const newBalances = await ledger.getBalancesInTransaction(transaction, userId);
    assertAllocationCutoverParity({
      hasOpening: true, liveVaultShares: shares,
      legacyGoalShares: Object.fromEntries(newRows.map(row => [row.goalId, BigInt(row.allocatedSharesAtomic)])),
      ledgerBalances: newBalances,
    });
    return true;
  }

  /**
   * Read-only ledger cutover preflight. Does not activate the ledger,
   * mutate legacy allocations, or infer historical provenance.
   */
  async assertGoalAllocationCutoverReady(input: {
    readonly userId: string;
    readonly walletAddress: string;
  }): Promise<void> {
    const { shares } = await this.readVaultShares(input.walletAddress);
    await this.db.transaction(async (transaction) => {
      const repository = new KeptRepository(transaction);
      await repository.lockGoalsForOwner(input.userId);
      const ledger = new AllocationLedgerStore(this.db);
      const hasOpening = await ledger.hasOpeningInTransaction(transaction, input.userId);
      const balances = await ledger.getBalancesInTransaction(transaction, input.userId);
      const legacyRows = await repository.listPositiveGoalAllocationsForOwner(input.userId);
      assertAllocationCutoverParity({
        hasOpening,
        liveVaultShares: shares,
        legacyGoalShares: Object.fromEntries(legacyRows.map(row => [
          row.goalId, BigInt(row.allocatedSharesAtomic),
        ])),
        ledgerBalances: balances,
      });
    });
  }

  /**
   * Mirror an already initialized allocation in the same DB transaction.
   * Legacy remains authoritative for API reads and commitment verification.
   */
  private async mirrorGoalAllocationIfReady(
    transaction: Parameters<Parameters<KeptDatabase["transaction"]>[0]>[0],
    repository: KeptRepository,
    input: {
      readonly userId: string;
      readonly vaultShares: bigint;
      readonly from: `GOAL:${string}` | "UNASSIGNED";
      readonly to: `GOAL:${string}` | "UNASSIGNED";
      readonly shares: bigint;
      readonly idempotencyKey: string;
    },
  ): Promise<void> {
    const ledger = new AllocationLedgerStore(this.db);
    if (!(await ledger.hasOpeningInTransaction(transaction, input.userId))) return;
    await ledger.assertVaultParityInTransaction(transaction, input.userId, input.vaultShares);
    await ledger.transferInTransaction(transaction, {
      userId: input.userId, from: input.from, to: input.to,
      shares: input.shares, key: input.idempotencyKey,
    });
    const legacy = await repository.listPositiveGoalAllocationsForOwner(input.userId);
    const balances = await ledger.getBalancesInTransaction(transaction, input.userId);
    assertAllocationCutoverParity({
      hasOpening: true, liveVaultShares: input.vaultShares,
      legacyGoalShares: Object.fromEntries(legacy.map(row => [
        row.goalId, BigInt(row.allocatedSharesAtomic),
      ])),
      ledgerBalances: balances,
    });
  }

  async getGoalAllocation(
    userId: string,
    goalId: string,
    walletAddress: string,
  ): Promise<GoalAllocationDto | null> {
    const { shares } =
      await this.readVaultShares(walletAddress);

    return this.db.transaction(async (transaction) => {
      const repository =
        new KeptRepository(transaction);

      await repository.lockGoalsForOwner(userId);

      if (
        !(await repository.findGoalForOwner(
          userId,
          goalId,
        ))
      ) {
        return null;
      }

      await this.reconcileGoalAndLedgerInTransaction(
        transaction, repository, userId, shares,
      );

      const allocationTotals =
        await repository.getAllocationTotals(
          userId,
          goalId,
        );

      return this.toGoalAllocationDto(
        goalId,
        BigInt(
          allocationTotals.goalAllocatedSharesAtomic,
        ),
        BigInt(
          allocationTotals.totalAllocatedSharesAtomic,
        ),
        shares,
      );
    });
  }

  async allocateGoalShares(input: {
    readonly userId: string;
    readonly goalId: string;
    readonly walletAddress: string;
    readonly shareDeltaAtomic: string;
    readonly reason: string;
    readonly idempotencyKey: string;
  }): Promise<GoalAllocationDto> {
    const delta = requireSignedAtomicShareDelta(input.shareDeltaAtomic);
    const reason = requireNonBlank(input.reason, "reason");
    const { idempotencyKey, ...request } = input;
    return this.executeIdempotent(
      input.userId,
      "goal:share-allocation:append",
      idempotencyKey,
      request,
      async (repository, transaction) => {
        await repository.lockGoalsForOwner(input.userId);
        if (!(await repository.findGoalForOwner(input.userId, input.goalId))) {
          throw new NotFoundError("Savings goal");
        }
        const { shares } = await this.readVaultShares(input.walletAddress);

        await this.reconcileGoalAndLedgerInTransaction(
          transaction, repository, input.userId, shares,
        );

        const allocationTotals = await repository.getAllocationTotals(input.userId, input.goalId);
        const currentGoalAllocation = BigInt(allocationTotals.goalAllocatedSharesAtomic);
        const totalAllocation = BigInt(allocationTotals.totalAllocatedSharesAtomic);
        const nextGoalAllocation = currentGoalAllocation + delta;
        const nextTotalAllocation = totalAllocation + delta;
        if (nextGoalAllocation < 0n) {
          throw new PersistenceValidationError("Goal allocation cannot become negative");
        }
        if (nextTotalAllocation > shares) {
          throw new PersistenceValidationError("Goal allocations exceed current vault shares");
        }
        await repository.appendGoalShareAllocation({
          id: randomUUID(),
          userId: input.userId,
          goalId: input.goalId,
          shareDeltaAtomic: delta.toString(),
          reason,
          transactionHash: null,
          createdAt: new Date(),
        });
        if (delta !== 0n) {
          await this.mirrorGoalAllocationIfReady(transaction, repository, {
            userId: input.userId, vaultShares: shares,
            from: delta > 0n ? "UNASSIGNED" : `GOAL:${input.goalId}`,
            to: delta > 0n ? `GOAL:${input.goalId}` : "UNASSIGNED",
            shares: delta > 0n ? delta : -delta,
            idempotencyKey: `goal-allocation:${idempotencyKey}`,
          });
        }
        return this.toGoalAllocationDto(input.goalId, nextGoalAllocation, nextTotalAllocation, shares);
      },
    );
  }

  async reallocateGoalShares(input: {
    readonly userId: string;
    readonly walletAddress: string;
    readonly fromGoalId: string;
    readonly toGoalId: string;
    readonly shareAmountAtomic: string;
    readonly idempotencyKey: string;
  }): Promise<{
    readonly from: GoalAllocationDto;
    readonly to: GoalAllocationDto;
  }> {
    const amount = requireSignedAtomicShareDelta(
      input.shareAmountAtomic,
    );

    if (amount <= 0n) {
      throw new PersistenceValidationError(
        "Reallocation amount must be greater than zero",
      );
    }

    if (input.fromGoalId === input.toGoalId) {
      throw new PersistenceValidationError(
        "Source and destination goals must be different",
      );
    }

    const { idempotencyKey, ...request } = input;

    return this.executeIdempotent(
      input.userId,
      "goal:share-reallocation",
      idempotencyKey,
      request,
      async (repository, transaction) => {
        /*
         * Use the same owner-wide goal lock as normal
         * allocation changes. This serializes changes
         * affecting goal share attribution.
         */
        await repository.lockGoalsForOwner(input.userId);

        const fromGoal =
          await repository.findGoalForOwner(
            input.userId,
            input.fromGoalId,
          );

        if (!fromGoal) {
          throw new NotFoundError("Source savings goal");
        }

        const toGoal =
          await repository.findGoalForOwner(
            input.userId,
            input.toGoalId,
          );

        if (!toGoal) {
          throw new NotFoundError(
            "Destination savings goal",
          );
        }

        const { shares } = await this.readVaultShares(
          input.walletAddress,
        );
        await this.reconcileGoalAndLedgerInTransaction(
          transaction, repository, input.userId, shares,
        );

        const fromTotals =
          await repository.getAllocationTotals(
            input.userId,
            input.fromGoalId,
          );

        const toTotals =
          await repository.getAllocationTotals(
            input.userId,
            input.toGoalId,
          );

        const fromAllocated = BigInt(
          fromTotals.goalAllocatedSharesAtomic,
        );

        const toAllocated = BigInt(
          toTotals.goalAllocatedSharesAtomic,
        );

        /*
         * Both calls should describe the same aggregate
         * total because they are scoped to the same user.
         */
        const totalAllocated = BigInt(
          fromTotals.totalAllocatedSharesAtomic,
        );

        if (fromAllocated < amount) {
          throw new PersistenceValidationError(
            "Source goal does not have enough allocated shares",
          );
        }

        /*
         * Reallocation does not change total allocation,
         * but retain this invariant check so corrupted
         * state cannot be propagated.
         */
        if (totalAllocated > shares) {
          throw new PersistenceValidationError(
            "Goal allocations exceed current vault shares",
          );
        }

        const nextFromAllocated =
          fromAllocated - amount;

        const nextToAllocated =
          toAllocated + amount;

        const now = new Date();

        /*
         * These writes occur inside the transaction created
         * by executeIdempotent(), so either both deltas are
         * recorded or neither is.
         */
        await repository.appendGoalShareAllocation({
          id: randomUUID(),
          userId: input.userId,
          goalId: input.fromGoalId,
          shareDeltaAtomic: (-amount).toString(),
          reason: "reallocation",
          transactionHash: null,
          createdAt: now,
        });

        await repository.appendGoalShareAllocation({
          id: randomUUID(),
          userId: input.userId,
          goalId: input.toGoalId,
          shareDeltaAtomic: amount.toString(),
          reason: "reallocation",
          transactionHash: null,
          createdAt: now,
        });

        await this.mirrorGoalAllocationIfReady(transaction, repository, {
          userId: input.userId, vaultShares: shares,
          from: `GOAL:${input.fromGoalId}`,
          to: `GOAL:${input.toGoalId}`,
          shares: amount,
          idempotencyKey: `goal-reallocation:${idempotencyKey}`,
        });

        return {
          from: this.toGoalAllocationDto(
            input.fromGoalId,
            nextFromAllocated,
            totalAllocated,
            shares,
          ),

          to: this.toGoalAllocationDto(
            input.toGoalId,
            nextToAllocated,
            totalAllocated,
            shares,
          ),
        };
      },
    );
  }

  private async reconcileGoalAllocationsToVaultBalance(
    repository: KeptRepository,
    userId: string,
    vaultShares: bigint,
  ): Promise<void> {
    const rows =
      await repository.listPositiveGoalAllocationsForOwner(
        userId,
      );

    if (rows.length === 0) return;

    const allocations = rows.map((row) => ({
      goalId: row.goalId,
      shares: BigInt(row.allocatedSharesAtomic),
    }));

    const totalAllocated = allocations.reduce(
      (total, allocation) => total + allocation.shares,
      0n,
    );

    if (totalAllocated <= vaultShares) {
      return;
    }

    //
    // Reduce allocations proportionally so that:
    //
    // sum(goal allocations) === vaultShares
    //
    // Integer division may leave a small remainder, so distribute
    // that deterministically afterwards.
    //
    const reconciled = allocations.map((allocation) => ({
      ...allocation,
      targetShares:
        allocation.shares * vaultShares / totalAllocated,
    }));

    let assigned = reconciled.reduce(
      (total, allocation) => total + allocation.targetShares,
      0n,
    );

    let remainder = vaultShares - assigned;

    for (const allocation of reconciled) {
      if (remainder === 0n) break;

      if (allocation.targetShares < allocation.shares) {
        allocation.targetShares += 1n;
        remainder -= 1n;
      }
    }

    if (remainder !== 0n) {
      throw new Error(
        "Goal allocation reconciliation could not distribute remainder",
      );
    }

    const now = new Date();

    for (const allocation of reconciled) {
      const delta =
        allocation.targetShares - allocation.shares;

      if (delta === 0n) continue;

      await repository.appendGoalShareAllocation({
        id: randomUUID(),
        userId,
        goalId: allocation.goalId,
        shareDeltaAtomic: delta.toString(),
        reason: "vault_balance_reconciliation",
        transactionHash: null,
        createdAt: now,
      });
    }
  }

  async createCommitmentDraft(input: {
    readonly userId: string;
    readonly idempotencyKey: string;
    readonly goalId: string;
    readonly definition: { readonly code: string; readonly version: number };
    readonly parameters: Readonly<Record<string, JsonValue>>;
    readonly epochStart: string;
    readonly epochEnd: string;
    readonly verificationDeadline: string;
  }): Promise<CommitmentDto> {
    const { idempotencyKey, ...request } = input;
    return this.executeIdempotent(
      input.userId,
      "commitment:draft:create",
      idempotencyKey,
      request,
      async (repository) => {
        if (!(await repository.findGoalForOwner(input.userId, input.goalId))) {
          throw new NotFoundError("Savings goal");
        }

        const validatedParameters = validateCatalogueReference(
          input.definition,
          input.parameters,
        );
        const persistedDefinition = await repository.findActiveDefinition(
          input.definition.code,
          input.definition.version,
        );
        if (!persistedDefinition) {
          throw new PersistenceValidationError("Commitment definition version is not active");
        }

        const existingCommitments =
          await repository.listCommitmentsForOwner(
            input.userId,
          );

        const duplicateCurrentCommitment =
          existingCommitments.some(
            (existing) =>
              existing.savingsGoalId === input.goalId
              && existing.definitionCode === input.definition.code
              && (
                existing.state === "DRAFT"
                || existing.state === "ACTIVE"
              ),
          );

        if (duplicateCurrentCommitment) {
          throw new PersistenceValidationError(
            "This goal already has a current commitment of this type",
          );
        }

        const epochStart = parseTimestamp(input.epochStart, "epochStart");
        const epochEnd = parseTimestamp(input.epochEnd, "epochEnd");
        const verificationDeadline = parseTimestamp(
          input.verificationDeadline,
          "verificationDeadline",
        );
        validateCommitmentWindow(
          validatedParameters,
          epochStart,
          epochEnd,
          verificationDeadline,
          this.commitmentWindowOverrideSeconds,
        );

        const id = randomUUID();
        const commitment = createCommitment({
          id,
          definition: input.definition,
          parameters: validatedParameters,
        });
        const now = new Date();
        const record = await repository.createCommitment({
          id,
          userId: input.userId,
          savingsGoalId: input.goalId,
          definitionId: persistedDefinition.id,
          parameters: commitment.parameters,
          epochStart,
          epochEnd,
          verificationDeadline,
          state: commitment.state,
          stateVersion: commitment.version,
          activatedAt: null,
          finalizedAt: null,
          createdAt: now,
          updatedAt: now,
        });
        if (!record) {
          throw new Error("Commitment insert did not return a record");
        }
        return mapCommitment(record);
      },
    );
  }

  async getCommitment(userId: string, id: string): Promise<CommitmentDto | null> {
    const commitment = await new KeptRepository(this.db).findCommitmentForOwner(userId, id);
    return commitment ? mapCommitment(commitment) : null;
  }

  async listCommitments(userId: string): Promise<readonly CommitmentDto[]> {
    const commitments = await new KeptRepository(this.db).listCommitmentsForOwner(userId);
    return commitments.map(mapCommitment);
  }

  async activateCommitment(input: {
    readonly userId: string;
    readonly commitmentId: string;
    readonly expectedVersion: number;
    readonly onchainCommitmentId: string;
    readonly settlementOwner: string;
    readonly settlementChainId: number;
    readonly settlementStatus: 1 | 2 | 3 | 4;
    readonly idempotencyKey: string;
  }): Promise<CommitmentDto> {
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
      throw new PersistenceValidationError("expectedVersion must be a positive safe integer");
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(input.settlementOwner)) {
      throw new PersistenceValidationError("settlementOwner must be an EVM address");
    }
    if (!Number.isSafeInteger(input.settlementChainId) || input.settlementChainId < 1) {
      throw new PersistenceValidationError("settlementChainId must be a positive safe integer");
    }
    if (![1, 2, 3, 4].includes(input.settlementStatus)) {
      throw new PersistenceValidationError("settlementStatus is invalid");
    }
    const settlementRef = encodeOnchainCommitmentId(input.onchainCommitmentId);
    const { idempotencyKey, ...request } = input;
    return this.executeIdempotent(
      input.userId,
      "commitment:activate",
      idempotencyKey,
      request,
      async (repository) => {
        const current = await repository.findCommitmentForOwnerForUpdate(
          input.userId,
          input.commitmentId,
        );
        if (!current) {
          throw new NotFoundError("Commitment");
        }

        const wallet =
          await repository.findPrimaryWalletForOwnerOnChain(
            input.userId,
            BigInt(input.settlementChainId),
          );

        if (!wallet) {
          throw new PersistenceValidationError(
            "User has no embedded wallet for the settlement chain",
          );
        }

        if (
          wallet.address.toLowerCase()
          !== input.settlementOwner.toLowerCase()
        ) {
          throw new PersistenceValidationError(
            "Commitment owner does not match the user's embedded wallet",
          );
        }

        if (["ACTIVE", "COMPLETED", "FAILED", "CANCELLED"].includes(current.state)) {
          if (
            current.opaqueSettlementRef
            && Buffer.from(current.opaqueSettlementRef).equals(Buffer.from(settlementRef))
          ) {
            return mapCommitment(current);
          }
          throw new PersistenceValidationError("Active commitment settlement does not match");
        }

        const validatedParameters = validateCatalogueReference(
          { code: current.definitionCode, version: current.definitionVersion },
          current.parameters,
        );
        const activeDefinition = await repository.findActiveDefinition(
          current.definitionCode,
          current.definitionVersion,
        );
        if (!activeDefinition || activeDefinition.id !== current.definitionId) {
          throw new PersistenceValidationError("Commitment definition version is not active");
        }
        validateCommitmentWindow(
          validatedParameters,
          current.epochStart,
          current.epochEnd,
          current.verificationDeadline,
          this.commitmentWindowOverrideSeconds,
        );

        const transitioned = transitionCommitment({
          commitment: {
            id: current.id,
            definition: {
              code: current.definitionCode,
              version: current.definitionVersion,
            },
            parameters: current.parameters,
            state: current.state,
            version: current.stateVersion,
          },
          expectedState: "DRAFT",
          expectedVersion: input.expectedVersion,
          targetState: "ACTIVE",
        });
        const now = new Date();
        const updated = await repository.updateCommitmentState({
          userId: input.userId,
          id: input.commitmentId,
          expectedState: "DRAFT",
          expectedVersion: input.expectedVersion,
          targetState: transitioned.state,
          opaqueSettlementRef: settlementRef,
          activatedAt: now,
          finalizedAt: null,
          updatedAt: now,
        });
        if (!updated) {
          const latest = await repository.findCommitmentForOwner(
            input.userId,
            input.commitmentId,
          );
          if (!latest) {
            throw new NotFoundError("Commitment");
          }
          throw new StaleCommitmentVersionError(input.expectedVersion, latest.stateVersion);
        }

        const settled = await repository.findCommitmentForOwner(
          input.userId,
          input.commitmentId,
        );
        if (!settled) {
          throw new Error("Activated commitment could not be reloaded");
        }
        return mapCommitment(settled);
      },
    );
  }

  private async cancelCommitmentWithRepository(
    repository: KeptRepository,
    input: {
      readonly userId: string;
      readonly commitmentId: string;
      readonly expectedVersion: number;
    },
  ): Promise<CommitmentDto> {
    if (
      !Number.isSafeInteger(input.expectedVersion)
      || input.expectedVersion < 1
    ) {
      throw new PersistenceValidationError(
        "expectedVersion must be a positive safe integer",
      );
    }

    const current =
      await repository.findCommitmentForOwnerForUpdate(
        input.userId,
        input.commitmentId,
      );

    if (!current) {
      throw new NotFoundError("Commitment");
    }

    if (current.state === "CANCELLED") {
      return mapCommitment(current);
    }

    if (
      current.state !== "DRAFT"
      && current.state !== "ACTIVE"
    ) {
      throw new PersistenceValidationError(
        "Only draft or active commitments can be cancelled",
      );
    }

    const transitioned = transitionCommitment({
      commitment: {
        id: current.id,
        definition: {
          code: current.definitionCode,
          version: current.definitionVersion,
        },
        parameters: current.parameters,
        state: current.state,
        version: current.stateVersion,
      },
      expectedState: current.state,
      expectedVersion: input.expectedVersion,
      targetState: "CANCELLED",
    });

    const now = new Date();

    const updated =
      await repository.updateCommitmentState({
        userId: input.userId,
        id: input.commitmentId,
        expectedState: current.state,
        expectedVersion: input.expectedVersion,
        targetState: transitioned.state,
        opaqueSettlementRef:
          current.opaqueSettlementRef,
        activatedAt: current.activatedAt,
        finalizedAt: now,
        updatedAt: now,
      });

    if (!updated) {
      const latest =
        await repository.findCommitmentForOwner(
          input.userId,
          input.commitmentId,
        );

      if (!latest) {
        throw new NotFoundError("Commitment");
      }

      throw new StaleCommitmentVersionError(
        input.expectedVersion,
        latest.stateVersion,
      );
    }

    const cancelled =
      await repository.findCommitmentForOwner(
        input.userId,
        input.commitmentId,
      );

    if (!cancelled) {
      throw new Error(
        "Cancelled commitment could not be reloaded",
      );
    }

    return mapCommitment(cancelled);
  }

  async cancelCommitment(input: {
    readonly userId: string;
    readonly commitmentId: string;
    readonly expectedVersion: number;
    readonly onchainCommitmentId: string;
    readonly settlementOwner: string;
    readonly idempotencyKey: string;
  }): Promise<CommitmentDto> {
    const { idempotencyKey, ...request } = input;

    return this.executeIdempotent(
      input.userId,
      "commitment:cancel",
      idempotencyKey,
      request,
      async (repository) => {
        const current =
          await repository.findCommitmentForOwnerForUpdate(
            input.userId,
            input.commitmentId,
          );

        if (!current) {
          throw new NotFoundError("Commitment");
        }

        if (
          current.state === "CANCELLED"
          && current.opaqueSettlementRef
          && decodeOnchainCommitmentId(
            current.opaqueSettlementRef,
          ) === input.onchainCommitmentId
        ) {
          return mapCommitment(current);
        }

        return this.cancelCommitmentWithRepository(
          repository,
          {
            userId: input.userId,
            commitmentId: input.commitmentId,
            expectedVersion: input.expectedVersion,
          },
        );
      },
    );
  }

  async archiveGoal(input: {
    readonly userId: string;
    readonly goalId: string;
    readonly idempotencyKey: string;
  }): Promise<GoalDto> {
    const { idempotencyKey, ...request } = input;

    return this.executeIdempotent(
      input.userId,
      "goal:archive",
      idempotencyKey,
      request,
      async (repository) => {
        await repository.lockGoalsForOwner(
          input.userId,
        );

        const goal =
          await repository.findGoalForOwner(
            input.userId,
            input.goalId,
          );

        if (!goal) {
          throw new NotFoundError("Savings goal");
        }

        if (goal.status === "ARCHIVED") {
          return mapGoal(goal);
        }

        const commitments =
          await repository.listCommitmentsForGoal(
            input.userId,
            input.goalId,
          );

        const cancellable = commitments.filter(
          (commitment) =>
            commitment.state === "DRAFT"
            || commitment.state === "ACTIVE",
        );

        for (const commitment of cancellable) {
          /*
           * Active on-chain commitments should only arrive
           * here after the frontend/API has verified their
           * on-chain cancellation.
           */
          if (commitment.state === "ACTIVE") {
            throw new PersistenceValidationError(
              "Active commitment must be cancelled on-chain before the goal can be archived",
            );
          }
          await this.cancelCommitmentWithRepository(
            repository,
            {
              userId: input.userId,
              commitmentId: commitment.id,
              expectedVersion:
                commitment.stateVersion,
            },
          );
        }

        const allocationTotals =
          await repository.getAllocationTotals(
            input.userId,
            input.goalId,
          );

        const allocatedShares = BigInt(
          allocationTotals.goalAllocatedSharesAtomic,
        );

        if (allocatedShares > 0n) {
          await repository.appendGoalShareAllocation({
            id: randomUUID(),
            userId: input.userId,
            goalId: input.goalId,
            shareDeltaAtomic:
              (-allocatedShares).toString(),
            reason: "goal_archived",
            transactionHash: null,
            createdAt: new Date(),
          });
        }

        const archived =
          await repository.archiveGoal({
            userId: input.userId,
            goalId: input.goalId,
            updatedAt: new Date(),
          });

        if (!archived) {
          throw new NotFoundError("Savings goal");
        }

        return mapGoal(archived);
      },
    );
  }

  private async readGoalAllocation(
    repository: KeptRepository,
    userId: string,
    goalId: string,
    walletAddress: string,
  ): Promise<GoalAllocationDto> {
    const { shares } = await this.readVaultShares(walletAddress);
    const allocationTotals = await repository.getAllocationTotals(userId, goalId);
    const allocatedShares = BigInt(allocationTotals.goalAllocatedSharesAtomic);
    const totalAllocatedShares = BigInt(allocationTotals.totalAllocatedSharesAtomic);
    return this.toGoalAllocationDto(goalId, allocatedShares, totalAllocatedShares, shares);
  }

  private async readVaultShares(
    walletAddress: string,
  ): Promise<{ readonly shares: bigint }> {
    if (!this.vaultShares) {
      throw new Error("Vault share reader is not configured");
    }
    const shares = await this.vaultShares.reader.readShares(walletAddress);
    if (shares < 0n) throw new Error("Vault returned a negative share balance");
    return { shares };
  }

  private toGoalAllocationDto(
    goalId: string,
    allocatedShares: bigint,
    totalAllocatedShares: bigint,
    vaultShares: bigint,
  ): GoalAllocationDto {
    if (allocatedShares < 0n) {
      throw new Error(
        "Goal allocation cannot be negative",
      );
    }

    if (totalAllocatedShares < 0n) {
      throw new Error(
        "Total goal allocation cannot be negative",
      );
    }

    if (totalAllocatedShares > vaultShares) {
      throw new Error(
        "Goal allocations exceed current vault shares after reconciliation",
      );
    }

    return {
      goalId,
      allocatedSharesAtomic:
        allocatedShares.toString(),
      totalVaultSharesAtomic:
        vaultShares.toString(),
      totalAllocatedSharesAtomic:
        totalAllocatedShares.toString(),
      unallocatedSharesAtomic:
        (vaultShares - totalAllocatedShares).toString(),
    };
  }

  private async executeIdempotent<T>(
    userId: string,
    scope: string,
    idempotencyKey: string,
    request: unknown,
    operation: (repository: KeptRepository, transaction: Parameters<Parameters<KeptDatabase["transaction"]>[0]>[0]) => Promise<T>,
  ): Promise<T> {
    const key = requireNonBlank(idempotencyKey, "idempotencyKey");
    const requestHash = hashRequest(request);

    return this.db.transaction(async (transaction) => {
      const repository = new KeptRepository(transaction);
      const id = randomUUID();
      const now = new Date();
      await repository.deleteExpiredIdempotency(userId, scope, key, now);
      const reserved = await repository.reserveIdempotency({
        id,
        userId,
        scope,
        idempotencyKey: key,
        requestHash,
        responseStatus: null,
        responseBody: null,
        expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MILLISECONDS),
        createdAt: now,
      });

      if (!reserved) {
        const existing = await repository.findIdempotency(userId, scope, key);
        if (!existing || existing.responseStatus === null || existing.responseBody === null) {
          throw new IncompleteIdempotencyRecordError();
        }
        if (existing.requestHash !== requestHash) {
          throw new IdempotencyConflictError();
        }
        return existing.responseBody as unknown as T;
      }

      const result = await operation(repository, transaction);
      const serializedResult = toJsonValue(result);
      await repository.completeIdempotency(id, serializedResult);
      return serializedResult as unknown as T;
    });
  }
}
