import {
  useCallback,
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
} from "@/application/ports/blockchain";
import {
  buildCancelCommitmentTransaction,
  commitmentManagerAbi,
} from "@/features/commitments/commitment-manager";
import {
  runGoalDeletion,
} from "@/features/goals/delete-goal-flow";
import {
  consumerErrorMessage,
} from "@/lib/consumer-error";
import {
  diagnostics,
} from "@/lib/diagnostics";
import type {
  VaultTransactionCoordinator,
} from "@/vault/transaction-lock";

interface UseGoalDeletionControllerInput {
  readonly api:
    KeptApi | null;

  readonly account:
    Address | null;

  readonly manager:
    Address | null;

  readonly chainId:
    number | null;

  readonly commitments:
    readonly CommitmentDto[];

  readonly sender:
    TransactionSender;

  readonly transactionCoordinator:
    VaultTransactionCoordinator;

  readonly ensureTransactionNetwork:
    () => Promise<void>;

  readonly readContract:
    ((
      input: unknown,
    ) => Promise<unknown>)
    | null;

  readonly waitForReceipt:
    ((
      hash: Hex,
    ) => Promise<{
      readonly status:
        "success"
        | "reverted";
    }>)
    | null;

  readonly refreshProductData:
    () => Promise<void>;
}

export function useGoalDeletionController({
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
}: UseGoalDeletionControllerInput): {
  readonly deletingGoal:
    boolean;

  readonly deleteGoalStatus:
    string | null;

  readonly deleteGoalError:
    string | null;

  readonly deleteGoal:
    (
      goal:
        GoalDto,
    ) => Promise<boolean>;

  readonly dismissGoalDeletion:
    () => void;
} {
  const [
    deletingGoal,
    setDeletingGoal,
  ] =
    useState(
      false,
    );

  const [
    deleteGoalStatus,
    setDeleteGoalStatus,
  ] =
    useState<
      string | null
    >(null);

  const [
    deleteGoalError,
    setDeleteGoalError,
  ] =
    useState<
      string | null
    >(null);

  const deleteGoal =
    useCallback(
      async (
        goal:
          GoalDto,
      ): Promise<boolean> => {
        if (
          !api
          || !account
          || !manager
          || !chainId
          || !readContract
          || !waitForReceipt
        ) {
          setDeleteGoalError(
            "Your Kept account is not ready yet.",
          );

          return false;
        }

        setDeletingGoal(
          true,
        );

        setDeleteGoalError(
          null,
        );

        setDeleteGoalStatus(
          null,
        );

        let succeeded =
          false;

        const acquired =
          await transactionCoordinator.run(
            "commitment",
            async () => {
              try {
                await runGoalDeletion(
                  goal,
                  {
                    commitments,

                    readOnchainStatus:
                      async (
                        commitment,
                      ) => {
                        if (
                          !commitment
                            .onchainCommitmentId
                        ) {
                          throw new Error(
                            "Active commitment is missing its on-chain reference.",
                          );
                        }

                        const record =
                          await readContract({
                            address:
                              manager,
                            abi:
                              commitmentManagerAbi,
                            functionName:
                              "commitments",
                            args: [
                              BigInt(
                                commitment
                                  .onchainCommitmentId,
                              ),
                            ],
                          });

                        if (
                          !Array.isArray(
                            record,
                          )
                        ) {
                          throw new Error(
                            "Commitment record is unavailable.",
                          );
                        }

                        const rawStatus =
                          record[6];

                        const status =
                          typeof rawStatus
                            === "bigint"
                            ? Number(
                                rawStatus,
                              )
                            : rawStatus;

                        switch (
                          status
                        ) {
                          case 1:
                            return "ACTIVE";

                          case 2:
                            return "COMPLETED";

                          case 3:
                            return "FAILED";

                          case 4:
                            return "CANCELLED";

                          default:
                            throw new Error(
                              `Unknown on-chain commitment status: ${String(status)}`,
                            );
                        }
                      },

                    cancelOnchain:
                      async (
                        commitment,
                      ) => {
                        if (
                          !commitment
                            .onchainCommitmentId
                        ) {
                          throw new Error(
                            "Active commitment is missing its on-chain reference.",
                          );
                        }

                        await ensureTransactionNetwork();

                        const transactionHash =
                          await sender
                            .sendTransaction(
                              buildCancelCommitmentTransaction({
                                manager,
                                chainId,
                                commitmentId:
                                  commitment
                                    .onchainCommitmentId,
                              }),
                            );

                        const receipt =
                          await waitForReceipt(
                            transactionHash,
                          );

                        if (
                          receipt.status
                          !== "success"
                        ) {
                          throw new Error(
                            "Commitment cancellation transaction reverted.",
                          );
                        }
                      },

                    persistCancellation:
                      async (
                        commitment,
                      ) => {
                        if (
                          !commitment
                            .onchainCommitmentId
                        ) {
                          throw new Error(
                            "Active commitment is missing its on-chain reference.",
                          );
                        }

                        await api
                          .cancelCommitment(
                            commitment,
                            {
                              onchainCommitmentId:
                                commitment
                                  .onchainCommitmentId,
                              owner:
                                account,
                            },
                          );
                      },

                    archiveGoal:
                      async (
                        goalToArchive,
                      ) => {
                        await api
                          .archiveGoal(
                            goalToArchive.id,
                            globalThis.crypto
                              .randomUUID(),
                          );
                      },

                    refresh:
                      refreshProductData,

                    onStage:
                      (
                        stage,
                      ) => {
                        setDeleteGoalStatus(
                          {
                            cancelling:
                              "Removing connected commitment…",
                            confirming:
                              "Confirming removal of commitment…",
                            archiving:
                              "Deleting goal…",
                          }[
                            stage
                          ],
                        );
                      },
                  },
                );

                setDeleteGoalStatus(
                  null,
                );

                succeeded =
                  true;
              } catch (
                error
              ) {
                diagnostics.error(
                  "api.goal_archive_failed",
                  error,
                  {
                    goalId:
                      goal.id,
                    activeCommitments:
                      commitments.filter(
                        (
                          commitment,
                        ) =>
                          commitment
                            .savingsGoalId
                            === goal.id
                          && commitment
                            .state
                            === "ACTIVE",
                      )
                        .length,
                  },
                );

                setDeleteGoalStatus(
                  null,
                );

                setDeleteGoalError(
                  consumerErrorMessage(
                    error,
                    "We could not delete this goal. Try again.",
                  ),
                );
              }
            },
          );

        if (
          !acquired
        ) {
          setDeleteGoalError(
            "Another account action is still being processed. Try again in a moment.",
          );
        }

        setDeletingGoal(
          false,
        );

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

  const dismissGoalDeletion =
    useCallback(
      () => {
        setDeleteGoalError(
          null,
        );

        setDeleteGoalStatus(
          null,
        );
      },
      [],
    );

  return {
    deletingGoal,
    deleteGoalStatus,
    deleteGoalError,
    deleteGoal,
    dismissGoalDeletion,
  };
}
