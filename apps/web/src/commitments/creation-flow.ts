import type { Hex } from "viem";

import type {
  CommitmentDto,
  CreateCommitmentRequest,
} from "../api/kept-api.js";
import {
  CommitmentConfirmationError,
  type ConfirmedCommitmentCreation,
} from "./commitment-manager.js";

export interface CommitmentCreationAttempt {
  readonly draftInput: CreateCommitmentRequest;
  readonly draftIdempotencyKey: string;
  readonly draft?: CommitmentDto;
  readonly transactionHash?: Hex;
  readonly settlement?: ConfirmedCommitmentCreation;
  readonly terminalFailure?: string;
}

export interface CommitmentCreationDependencies {
  readonly draftInput: CreateCommitmentRequest;
  readonly draftIdempotencyKey: string;
  readonly createDraft: (
    input: CreateCommitmentRequest,
    idempotencyKey: string,
  ) => Promise<CommitmentDto>;
  readonly sendTransaction: (draft: CommitmentDto) => Promise<Hex>;
  readonly confirmTransaction: (
    draft: CommitmentDto,
    transactionHash: Hex,
  ) => Promise<ConfirmedCommitmentCreation>;
  readonly activateDraft: (
    draft: CommitmentDto,
    settlement: ConfirmedCommitmentCreation,
  ) => Promise<CommitmentDto>;
  readonly onStage?: (stage: "draft" | "wallet" | "confirmation" | "activation") => void;
  readonly onAttempt?: (attempt: CommitmentCreationAttempt) => void;
  readonly now?: () => number;
}

export type CommitmentCreationResult =
  | { readonly ok: true; readonly commitment: CommitmentDto }
  | { readonly ok: false; readonly error: unknown; readonly attempt: CommitmentCreationAttempt | null };

export async function runCommitmentCreation(
  previous: CommitmentCreationAttempt | null,
  dependencies: CommitmentCreationDependencies,
): Promise<CommitmentCreationResult> {
  let attempt = previous;
  try {
    if (attempt?.terminalFailure) {
      throw new Error(attempt.terminalFailure);
    }
    if (!attempt) {
      attempt = {
        draftInput: dependencies.draftInput,
        draftIdempotencyKey: dependencies.draftIdempotencyKey,
      };
      dependencies.onAttempt?.(attempt);
    }

    if (!attempt.draft) {
      dependencies.onStage?.("draft");
      attempt = {
        ...attempt,
        draft: await dependencies.createDraft(
          attempt.draftInput,
          attempt.draftIdempotencyKey,
        ),
      };
      dependencies.onAttempt?.(attempt);
    }
    const draft = attempt.draft;
    if (!draft) throw new Error("Commitment draft is unavailable");

    if (!attempt.transactionHash) {
      if (Date.parse(draft.epochStart) <= (dependencies.now?.() ?? Date.now())) {
        throw new CommitmentConfirmationError(
          "The commitment setup window has expired.",
          false,
        );
      }
      dependencies.onStage?.("wallet");
      attempt = {
        ...attempt,
        transactionHash: await dependencies.sendTransaction(draft),
      };
      dependencies.onAttempt?.(attempt);
    }

    if (!attempt.settlement) {
      dependencies.onStage?.("confirmation");
      const transactionHash = attempt.transactionHash;
      if (!transactionHash) throw new Error("Commitment transaction hash is unavailable");
      attempt = {
        ...attempt,
        settlement: await dependencies.confirmTransaction(draft, transactionHash),
      };
      dependencies.onAttempt?.(attempt);
    }

    dependencies.onStage?.("activation");
    const settlement = attempt.settlement;
    if (!settlement) throw new Error("Commitment settlement is unavailable");
    const commitment = await dependencies.activateDraft(draft, settlement);
    if (
      commitment.state === "DRAFT"
      || commitment.onchainCommitmentId !== settlement.commitmentId.toString()
    ) {
      throw new Error("API activation did not return the confirmed onchain settlement");
    }
    return {
      ok: true,
      commitment,
    };
  } catch (error) {
    if (attempt && error instanceof CommitmentConfirmationError) {
      attempt = error.restartable
        ? {
            draftInput: attempt.draftInput,
            draftIdempotencyKey: attempt.draftIdempotencyKey,
            ...(attempt.draft ? { draft: attempt.draft } : {}),
          }
        : { ...attempt, terminalFailure: error.message };
      dependencies.onAttempt?.(attempt);
    }
    return { ok: false, error, attempt };
  }
}
