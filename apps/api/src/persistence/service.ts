import { createHash, randomUUID } from "node:crypto";

import {
  getCommitmentDefinition,
  validateCommitmentParameters,
} from "@kept/commitment-catalogue";

import type { KeptDatabase } from "../db/client.js";
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
  readonly activatedAt: string | null;
  readonly finalizedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
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
): void {
  if (epochEnd <= epochStart || verificationDeadline < epochEnd) {
    throw new PersistenceValidationError("Commitment period timestamps are out of order");
  }

  const periodDays = parameters.periodDays;
  if (!Number.isSafeInteger(periodDays) || typeof periodDays !== "number" || periodDays < 1) {
    throw new PersistenceValidationError("Commitment periodDays must be a positive safe integer");
  }
  const expectedDurationMilliseconds = periodDays * 24 * 60 * 60 * 1_000;
  if (epochEnd.getTime() - epochStart.getTime() !== expectedDurationMilliseconds) {
    throw new PersistenceValidationError("Commitment window must match the catalogue period");
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
    activatedAt: row.activatedAt?.toISOString() ?? null,
    finalizedAt: row.finalizedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class KeptPersistenceService {
  constructor(private readonly db: KeptDatabase) {}

  async createUser(input: {
    readonly privyUserId: string;
    readonly displayName?: string | null;
  }): Promise<UserDto> {
    const now = new Date();
    const repository = new KeptRepository(this.db);
    const user = await repository.createUser({
      id: randomUUID(),
      privyUserId: requireNonBlank(input.privyUserId, "privyUserId"),
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
    readonly idempotencyKey: string;
  }): Promise<CommitmentDto> {
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
      throw new PersistenceValidationError("expectedVersion must be a positive safe integer");
    }
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

        const active = await repository.findCommitmentForOwner(
          input.userId,
          input.commitmentId,
        );
        if (!active) {
          throw new Error("Activated commitment could not be reloaded");
        }
        return mapCommitment(active);
      },
    );
  }


  async cancelCommitment(input: {
    readonly userId: string;
    readonly commitmentId: string;
    readonly expectedVersion: number;
    readonly idempotencyKey: string;
  }): Promise<CommitmentDto> {
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
      throw new PersistenceValidationError("expectedVersion must be a positive safe integer");
    }
    const { idempotencyKey, ...request } = input;
    return this.executeIdempotent(
      input.userId,
      "commitment:cancel",
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
        if (current.state !== "DRAFT" && current.state !== "ACTIVE") {
          throw new PersistenceValidationError("Only draft or active commitments can be cancelled");
        }

        const transitioned = transitionCommitment({
          commitment: {
            id: current.id,
            definition: { code: current.definitionCode, version: current.definitionVersion },
            parameters: current.parameters,
            state: current.state,
            version: current.stateVersion,
          },
          expectedState: current.state,
          expectedVersion: input.expectedVersion,
          targetState: "CANCELLED",
        });
        const now = new Date();
        const updated = await repository.updateCommitmentState({
          userId: input.userId,
          id: input.commitmentId,
          expectedState: current.state,
          expectedVersion: input.expectedVersion,
          targetState: transitioned.state,
          activatedAt: current.activatedAt,
          finalizedAt: now,
          updatedAt: now,
        });
        if (!updated) {
          const latest = await repository.findCommitmentForOwner(
            input.userId,
            input.commitmentId,
          );
          if (!latest) throw new NotFoundError("Commitment");
          throw new StaleCommitmentVersionError(input.expectedVersion, latest.stateVersion);
        }

        const cancelled = await repository.findCommitmentForOwner(
          input.userId,
          input.commitmentId,
        );
        if (!cancelled) throw new Error("Cancelled commitment could not be reloaded");
        return mapCommitment(cancelled);
      },
    );
  }

  private async executeIdempotent<T>(
    userId: string,
    scope: string,
    idempotencyKey: string,
    request: unknown,
    operation: (repository: KeptRepository) => Promise<T>,
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

      const result = await operation(repository);
      const serializedResult = toJsonValue(result);
      await repository.completeIdempotency(id, serializedResult);
      return serializedResult as unknown as T;
    });
  }
}
