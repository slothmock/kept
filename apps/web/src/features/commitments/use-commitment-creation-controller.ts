import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  Address,
  Hex,
} from "viem";

import type {
  CommitmentDto,
  GoalDto,
  KeptApi,
} from "@/api/kept-api";
import type {
  TransactionSender,
} from "@/wallet/blockchain";
import type {
  CreateCommitmentInput,
} from "@/features/commitments/components/CreateCommitmentDialog";
import {
  buildCreateCommitmentTransaction,
  confirmCommitmentCreation,
  referenceIdForCommitment,
  timestampSeconds,
} from "@/features/commitments/commitment-manager";
import {
  runCommitmentCreation,
  type CommitmentCreationAttempt,
} from "@/features/commitments/creation-flow";
import {
  clearPendingCommitmentAttempt,
  loadPendingCommitmentAttempt,
  reconcilePendingAttempt,
  savePendingCommitmentAttempt,
} from "@/features/commitments/pending-attempt";
import {
  consumerErrorMessage,
} from "@/lib/consumer-error";
import {
  diagnostics,
} from "@/lib/diagnostics";
import {
  parseUsdcDepositAmount,
} from "@/vault/deposit-input";
import type {
  VaultTransactionCoordinator,
} from "@/vault/transaction-lock";

interface CommitmentReceipt {
  readonly status:
    "success"
    | "reverted";

  readonly logs:
    readonly {
      readonly address:
        Address;

      readonly data:
        Hex;

      readonly topics:
        readonly Hex[];
    }[];
}

interface UseCommitmentCreationControllerInput {
  readonly api:
    KeptApi | null;

  readonly account:
    Address | null;

  readonly manager:
    Address | null;

  readonly chainId:
    number | null;

  readonly commitments:
    readonly CommitmentDto[] | null;

  readonly sender:
    TransactionSender;

  readonly transactionCoordinator:
    VaultTransactionCoordinator;

  readonly ensureTransactionNetwork:
    () => Promise<void>;

  readonly readContract:
    ((
      input:
        unknown,
    ) => Promise<unknown>)
    | null;

  readonly waitForReceipt:
    ((
      transactionHash:
        Hex,
    ) => Promise<CommitmentReceipt>)
    | null;

  readonly refreshProductData:
    () => Promise<void>;
}

export function useCommitmentCreationController({
  api,
  account,
  manager,
  chainId,
  commitments,
  sender,
  transactionCoordinator,
  ensureTransactionNetwork,
  readContract,
  waitForReceipt,
  refreshProductData,
}: UseCommitmentCreationControllerInput): {
  readonly creatingCommitment:
    boolean;

  readonly commitmentStatus:
    string | null;

  readonly commitmentError:
    string | null;

  readonly createCommitment:
    (
      goal:
        GoalDto,
      input:
        CreateCommitmentInput,
    ) => Promise<boolean>;

  readonly dismissCommitment:
    () => void;
} {
  const [
    creatingCommitment,
    setCreatingCommitment,
  ] =
    useState(
      false,
    );

  const [
    commitmentStatus,
    setCommitmentStatus,
  ] =
    useState<
      string | null
    >(null);

  const [
    commitmentError,
    setCommitmentError,
  ] =
    useState<
      string | null
    >(null);

  const pendingCommitmentAttempt =
    useRef<
      CommitmentCreationAttempt
      | null
    >(null);

  useEffect(
    () => {
      if (
        !account
      ) {
        pendingCommitmentAttempt
          .current =
          null;

        return;
      }

      try {
        pendingCommitmentAttempt
          .current =
          loadPendingCommitmentAttempt(
            globalThis.localStorage,
            account,
          );
      } catch {
        pendingCommitmentAttempt
          .current =
          null;
      }
    },
    [
      account,
    ],
  );

  useEffect(
    () => {
      if (
        !account
        || commitments === null
      ) {
        return;
      }

      const attempt =
        pendingCommitmentAttempt
          .current;

      if (
        !attempt
      ) {
        return;
      }

      const reconciled =
        reconcilePendingAttempt(
          attempt,
          commitments,
        );

      pendingCommitmentAttempt
        .current =
        reconciled;

      if (
        reconciled
      ) {
        savePendingCommitmentAttempt(
          globalThis.localStorage,
          account,
          reconciled,
        );
      } else {
        clearPendingCommitmentAttempt(
          globalThis.localStorage,
          account,
        );
      }
    },
    [
      account,
      commitments,
    ],
  );

  const createCommitment =
    useCallback(
      async (
        goal:
          GoalDto,
        input:
          CreateCommitmentInput,
      ): Promise<boolean> => {
        if (
          !api
          || !account
          || !manager
          || !chainId
          || !readContract
          || !waitForReceipt
        ) {
          setCommitmentError(
            "Commitments are unavailable because Kept is not configured.",
          );

          return false;
        }

        const parsed =
          parseUsdcDepositAmount(
            input.target,
          );

        if (
          "error" in parsed
          || parsed.assets
            <= 0n
        ) {
          setCommitmentError(
            "Enter a valid weekly savings amount.",
          );

          return false;
        }

        const parameters = {
          targetAmountAtomic:
            parsed.assets
              .toString(),
          periodDays:
            7,
        };

        const draftInput = {
          goalId:
            goal.id,
          definition: {
            code:
              input.code,
            version:
              1,
          },
          parameters,
          epochStart:
            input.startAt
              .toISOString(),
          epochEnd:
            input.endAt
              .toISOString(),
          verificationDeadline:
            input
              .verificationDeadline
              .toISOString(),
        };

        const recoverableDraft =
          commitments?.find(
            (
              commitment,
            ) =>
              commitment.state
                === "DRAFT"
              && commitment
                .savingsGoalId
                === goal.id
              && commitment
                .definition
                .code
                === input.code
              && commitment
                .parameters
                .targetAmountAtomic
                === parameters
                  .targetAmountAtomic,
          );

        const existingAttempt =
          pendingCommitmentAttempt
            .current
          ?? (
            recoverableDraft
              ? {
                  draftInput: {
                    goalId:
                      recoverableDraft
                        .savingsGoalId,
                    definition:
                      recoverableDraft
                        .definition,
                    parameters:
                      recoverableDraft
                        .parameters,
                    epochStart:
                      recoverableDraft
                        .epochStart,
                    epochEnd:
                      recoverableDraft
                        .epochEnd,
                    verificationDeadline:
                      recoverableDraft
                        .verificationDeadline,
                  },
                  draftIdempotencyKey:
                    globalThis.crypto
                      .randomUUID(),
                  draft:
                    recoverableDraft,
                }
              : null
          );

        if (
          existingAttempt
            ?.terminalFailure
        ) {
          setCommitmentError(
            "Kept couldn't finish setting up this commitment. Contact support before trying again.",
          );

          return false;
        }

        if (
          existingAttempt
          && (
            existingAttempt
              .draftInput
              .goalId
              !== goal.id
            || existingAttempt
              .draftInput
              .definition
              .code
              !== input.code
            || existingAttempt
              .draftInput
              .parameters
              .targetAmountAtomic
              !== parameters
                .targetAmountAtomic
          )
        ) {
          setCommitmentError(
            "Finish retrying your pending commitment before creating a different one.",
          );

          return false;
        }

        setCreatingCommitment(
          true,
        );

        setCommitmentError(
          null,
        );

        let succeeded =
          false;

        const acquired =
          await transactionCoordinator
            .run(
              "commitment",
              async () => {
                const result =
                  await runCommitmentCreation(
                    existingAttempt,
                    {
                      draftInput,
                      draftIdempotencyKey:
                        existingAttempt
                          ?.draftIdempotencyKey
                        ?? globalThis.crypto
                          .randomUUID(),

                      createDraft:
                        (
                          request,
                          idempotencyKey,
                        ) =>
                          api.createCommitment(
                            request,
                            idempotencyKey,
                          ),

                      sendTransaction:
                        async (
                          draft,
                        ) => {
                          await ensureTransactionNetwork();

                          return sender
                            .sendTransaction(
                              buildCreateCommitmentTransaction({
                                manager,
                                chainId,
                                referenceId:
                                  referenceIdForCommitment(
                                    draft.id,
                                  ),
                                startAt:
                                  timestampSeconds(
                                    draft.epochStart,
                                  ),
                                endAt:
                                  timestampSeconds(
                                    draft.epochEnd,
                                  ),
                              }),
                            );
                        },

                      confirmTransaction:
                        async (
                          draft,
                          transactionHash,
                        ) => {
                          const receipt =
                            await waitForReceipt(
                              transactionHash,
                            );

                          return confirmCommitmentCreation({
                            manager,
                            owner:
                              account,
                            referenceId:
                              referenceIdForCommitment(
                                draft.id,
                              ),
                            startAt:
                              timestampSeconds(
                                draft.epochStart,
                              ),
                            endAt:
                              timestampSeconds(
                                draft.epochEnd,
                              ),
                            transactionHash,
                            receipt,
                            readContract:
                              (
                                request,
                              ) =>
                                readContract(
                                  request,
                                ),
                          });
                        },

                      activateDraft:
                        async (
                          draft,
                          settlement,
                        ) =>
                          api.activateCommitment(
                            draft,
                            {
                              onchainCommitmentId:
                                settlement
                                  .commitmentId
                                  .toString(),
                              transactionHash:
                                settlement
                                  .transactionHash,
                            },
                          ),

                      onStage:
                        (
                          stage,
                        ) =>
                          setCommitmentStatus(
                            {
                              draft:
                                "Preparing your commitment…",
                              wallet:
                                "Creating your commitment…",
                              confirmation:
                                "Creating your commitment…",
                              activation:
                                "Finishing your commitment…",
                            }[
                              stage
                            ],
                          ),

                      onAttempt:
                        (
                          attempt,
                        ) => {
                          pendingCommitmentAttempt
                            .current =
                            attempt;

                          if (
                            !savePendingCommitmentAttempt(
                              globalThis.localStorage,
                              account,
                              attempt,
                            )
                          ) {
                            throw new Error(
                              "Local commitment recovery state could not be saved",
                            );
                          }
                        },
                    },
                  );

                if (
                  !result.ok
                ) {
                  pendingCommitmentAttempt
                    .current =
                    result.attempt;

                  diagnostics.error(
                    "commitment.creation_failed",
                    result.error,
                    {
                      hasTransaction:
                        Boolean(
                          result
                            .attempt
                            ?.transactionHash,
                        ),
                      chainConfirmed:
                        Boolean(
                          result
                            .attempt
                            ?.settlement,
                        ),
                    },
                  );

                  setCommitmentStatus(
                    null,
                  );

                  setCommitmentError(
                    result
                      .attempt
                      ?.terminalFailure
                      ? "Kept could not safely reconcile this confirmed commitment. Contact support before trying again."
                      : consumerErrorMessage(
                          result.error,
                          result
                            .attempt
                            ?.settlement
                            ? "Your commitment was created, but Kept couldn't finish updating it. Try again."
                            : "We could not create your commitment. Try again.",
                        ),
                  );

                  return;
                }

                pendingCommitmentAttempt
                  .current =
                  null;

                try {
                  clearPendingCommitmentAttempt(
                    globalThis.localStorage,
                    account,
                  );
                } catch {
                  // Confirmed API/chain state takes precedence over stale local recovery data.
                }

                setCommitmentStatus(
                  "Commitment created. Updating your goal…",
                );

                await refreshProductData();

                setCommitmentStatus(
                  null,
                );

                succeeded =
                  true;
              },
            );

        setCreatingCommitment(
          false,
        );

        if (
          !acquired
        ) {
          setCommitmentStatus(
            null,
          );

          setCommitmentError(
            "Another account request is already in progress.",
          );
        }

        return succeeded;
      },
      [
        account,
        api,
        chainId,
        commitments,
        ensureTransactionNetwork,
        manager,
        readContract,
        refreshProductData,
        sender,
        transactionCoordinator,
        waitForReceipt,
      ],
    );

  const dismissCommitment =
    useCallback(
      () => {
        setCommitmentError(
          null,
        );

        setCommitmentStatus(
          null,
        );
      },
      [],
    );

  return {
    creatingCommitment,
    commitmentStatus,
    commitmentError,
    createCommitment,
    dismissCommitment,
  };
}
