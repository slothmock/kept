import { isHex, keccak256, toBytes, type Address, type Hex } from "viem";

import type {
  CommitmentDto,
  CreateCommitmentRequest,
} from "../api/kept-api.js";
import type { CommitmentCreationAttempt } from "./creation-flow.js";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StoredAttempt {
  readonly draftInput: CreateCommitmentRequest;
  readonly draftIdempotencyKey: string;
  readonly draft?: CommitmentDto;
  readonly transactionHash?: Hex;
  readonly terminalFailure?: string;
  readonly settlement?: {
    readonly commitmentId: string;
    readonly referenceId: Hex;
    readonly transactionHash: Hex;
  };
}

function key(account: Address): string {
  return `kept.pending-commitment.v2.${keccak256(toBytes(account.toLowerCase()))}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validDraftInput(value: unknown): value is CreateCommitmentRequest {
  if (!isRecord(value) || !isRecord(value.definition) || !isRecord(value.parameters)) return false;
  return typeof value.goalId === "string"
    && typeof value.definition.code === "string"
    && typeof value.definition.version === "number"
    && typeof value.epochStart === "string"
    && Number.isFinite(Date.parse(value.epochStart))
    && typeof value.epochEnd === "string"
    && Number.isFinite(Date.parse(value.epochEnd))
    && typeof value.verificationDeadline === "string"
    && Number.isFinite(Date.parse(value.verificationDeadline));
}

function validDraft(value: unknown): value is CommitmentDto {
  if (!isRecord(value) || !isRecord(value.definition) || !isRecord(value.parameters)) return false;
  return typeof value.id === "string"
    && typeof value.userId === "string"
    && typeof value.savingsGoalId === "string"
    && typeof value.definition.code === "string"
    && typeof value.definition.version === "number"
    && typeof value.epochStart === "string"
    && Number.isFinite(Date.parse(value.epochStart))
    && typeof value.epochEnd === "string"
    && Number.isFinite(Date.parse(value.epochEnd))
    && typeof value.verificationDeadline === "string"
    && value.state === "DRAFT"
    && value.stateVersion === 1;
}

function validHash(value: unknown): value is Hex {
  return typeof value === "string" && isHex(value) && value.length === 66;
}

export function savePendingCommitmentAttempt(
  storage: StorageLike,
  account: Address,
  attempt: CommitmentCreationAttempt,
): boolean {
  const stored: StoredAttempt = {
    draftInput: attempt.draftInput,
    draftIdempotencyKey: attempt.draftIdempotencyKey,
    ...(attempt.draft ? { draft: attempt.draft } : {}),
    ...(attempt.transactionHash ? { transactionHash: attempt.transactionHash } : {}),
    ...(attempt.terminalFailure ? { terminalFailure: attempt.terminalFailure } : {}),
    ...(attempt.settlement ? {
      settlement: {
        commitmentId: attempt.settlement.commitmentId.toString(),
        referenceId: attempt.settlement.referenceId,
        transactionHash: attempt.settlement.transactionHash,
      },
    } : {}),
  };
  try {
    storage.setItem(key(account), JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}

export function loadPendingCommitmentAttempt(
  storage: StorageLike,
  account: Address,
): CommitmentCreationAttempt | null {
  try {
    const raw = storage.getItem(key(account));
    if (!raw) return null;
    const stored: unknown = JSON.parse(raw);
    if (
      !isRecord(stored)
      || !validDraftInput(stored.draftInput)
      || typeof stored.draftIdempotencyKey !== "string"
      || stored.draftIdempotencyKey.length < 8
      || (stored.draft !== undefined && !validDraft(stored.draft))
      || (stored.transactionHash !== undefined && !validHash(stored.transactionHash))
      || (stored.terminalFailure !== undefined && typeof stored.terminalFailure !== "string")
    ) return null;

    let settlement: CommitmentCreationAttempt["settlement"];
    if (stored.settlement !== undefined) {
      if (!isRecord(stored.settlement)) return null;
      const { commitmentId, referenceId, transactionHash } = stored.settlement;
      if (
        typeof commitmentId !== "string"
        || !/^\d+$/.test(commitmentId)
        || BigInt(commitmentId) < 1n
        || !validHash(referenceId)
        || !validHash(transactionHash)
      ) return null;
      settlement = {
        commitmentId: BigInt(commitmentId),
        referenceId,
        owner: account,
        transactionHash,
      };
    }

    return {
      draftInput: stored.draftInput,
      draftIdempotencyKey: stored.draftIdempotencyKey,
      ...(stored.draft ? { draft: stored.draft } : {}),
      ...(stored.transactionHash ? { transactionHash: stored.transactionHash as Hex } : {}),
      ...(stored.terminalFailure ? { terminalFailure: stored.terminalFailure } : {}),
      ...(settlement ? { settlement } : {}),
    };
  } catch {
    return null;
  }
}

export function clearPendingCommitmentAttempt(storage: StorageLike, account: Address): void {
  try {
    storage.removeItem(key(account));
  } catch {
    // A failed cleanup must not turn a confirmed commitment into a user-facing failure.
  }
}

function matchesInput(commitment: CommitmentDto, input: CreateCommitmentRequest): boolean {
  return commitment.savingsGoalId === input.goalId
    && commitment.definition.code === input.definition.code
    && commitment.definition.version === input.definition.version
    && commitment.epochStart === input.epochStart
    && commitment.epochEnd === input.epochEnd
    && commitment.verificationDeadline === input.verificationDeadline
    && JSON.stringify(commitment.parameters) === JSON.stringify(input.parameters);
}

export function reconcilePendingAttempt(
  attempt: CommitmentCreationAttempt,
  commitments: readonly CommitmentDto[],
): CommitmentCreationAttempt | null {
  if (attempt.draft) {
    const current = commitments.find((commitment) => commitment.id === attempt.draft?.id);
    return current?.state === "DRAFT" ? { ...attempt, draft: current } : null;
  }

  const recovered = commitments.find((commitment) =>
    commitment.state === "DRAFT" && matchesInput(commitment, attempt.draftInput)
  );
  return recovered ? { ...attempt, draft: recovered } : attempt;
}

export function pendingAttemptIsResolved(
  attempt: CommitmentCreationAttempt,
  commitments: readonly CommitmentDto[],
): boolean {
  return reconcilePendingAttempt(attempt, commitments) === null;
}
