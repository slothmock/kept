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
} from "@/api/kept-api";
import type {
  TransactionSender,
} from "@/application/ports/blockchain";
import {
  claimCommitmentReward,
} from "@/features/commitments/reward-claim";
import {
  consumerErrorMessage,
} from "@/lib/consumer-error";
import {
  diagnostics,
} from "@/lib/diagnostics";
import type {
  VaultTransactionCoordinator,
} from "@/vault/transaction-lock";

interface UseRewardClaimControllerInput {
  readonly account:
    Address | null;

  readonly manager:
    Address | null;

  readonly chainId:
    number | null;

  readonly commitments:
    readonly CommitmentDto[]
    | null;

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
      transactionHash: Hex,
    ) => Promise<{
      readonly status:
        "success"
        | "reverted";
    }>)
    | null;

  readonly refreshPosition:
    () => Promise<void>;

  readonly refreshRewardStates:
    (
      commitments:
        readonly CommitmentDto[],
    ) => Promise<void>;
}

export function useRewardClaimController({
  account,
  manager,
  chainId,
  commitments,
  sender,
  transactionCoordinator,
  ensureTransactionNetwork,
  readContract,
  waitForReceipt,
  refreshPosition,
  refreshRewardStates,
}: UseRewardClaimControllerInput): {
  readonly claimingRewardId:
    string | null;

  readonly rewardClaimError:
    {
      readonly commitmentId:
        string;

      readonly message:
        string;
    }
    | null;

  readonly claimReward:
    (
      commitment:
        CommitmentDto,
    ) => Promise<boolean>;
} {
  const [
    claimingRewardId,
    setClaimingRewardId,
  ] =
    useState<
      string | null
    >(null);

  const [
    rewardClaimError,
    setRewardClaimError,
  ] =
    useState<{
      readonly commitmentId:
        string;

      readonly message:
        string;
    } | null>(
      null,
    );

  const claimReward =
    useCallback(
      async (
        commitment:
          CommitmentDto,
      ): Promise<boolean> => {
        if (
          !account
          || !manager
          || !chainId
          || !commitment
            .onchainCommitmentId
          || !readContract
          || !waitForReceipt
        ) {
          setRewardClaimError({
            commitmentId:
              commitment.id,
            message:
              "Your Kept account is not ready yet.",
          });

          return false;
        }

        setRewardClaimError(
          null,
        );

        setClaimingRewardId(
          commitment.id,
        );

        let succeeded =
          false;

        const acquired =
          await transactionCoordinator.run(
            "commitment",
            async () => {
              try {
                await ensureTransactionNetwork();

                const result =
                  await claimCommitmentReward({
                    manager,
                    chainId,
                    commitmentId:
                      commitment
                        .onchainCommitmentId!,
                    sender,
                    readContract:
                      (request) =>
                        readContract(
                          request,
                        ),
                    waitForReceipt,
                  });

                if (
                  !result.ok
                ) {
                  throw result.error;
                }

                await Promise.all([
                  refreshPosition(),
                  refreshRewardStates(
                    commitments
                    ?? [
                      commitment,
                    ],
                  ),
                ]);

                succeeded =
                  true;
              } catch (
                error
              ) {
                diagnostics.warn(
                  "commitment.reward_claim_failed",
                  error,
                  {
                    commitmentId:
                      commitment.id,
                    onchainCommitmentId:
                      commitment
                        .onchainCommitmentId,
                  },
                );

                setRewardClaimError({
                  commitmentId:
                    commitment.id,
                  message:
                    consumerErrorMessage(
                      error,
                      "We could not claim your reward. Try again.",
                    ),
                });
              }
            },
          );

        if (
          !acquired
        ) {
          setRewardClaimError({
            commitmentId:
              commitment.id,
            message:
              "Another account action is still being processed. Try again in a moment.",
          });
        }

        setClaimingRewardId(
          null,
        );

        return succeeded;
      },
      [
        account,
        chainId,
        commitments,
        ensureTransactionNetwork,
        manager,
        readContract,
        refreshPosition,
        refreshRewardStates,
        sender,
        transactionCoordinator,
        waitForReceipt,
      ],
    );

  return {
    claimingRewardId,
    rewardClaimError,
    claimReward,
  };
}
