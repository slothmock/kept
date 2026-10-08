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
  KeptApi,
} from "@/api/kept-api";
import {
  buildCancelCommitmentTransaction,
} from "@/features/commitments/commitment-manager";
import {
  consumerErrorMessage,
} from "@/lib/consumer-error";
import {
  diagnostics,
} from "@/lib/diagnostics";
import type {
  VaultTransactionCoordinator,
} from "@/lib/transaction-lock";
import type {
  TransactionSender,
} from "@/wallet/blockchain";

interface UseCommitmentCancellationControllerInput {
  readonly api: KeptApi | null;
  readonly account: Address | null;
  readonly manager: Address | null;
  readonly chainId: number | null;
  readonly sender: TransactionSender;
  readonly transactionCoordinator: VaultTransactionCoordinator;
  readonly ensureTransactionNetwork: () => Promise<void>;
  readonly waitForReceipt:
    | ((hash: Hex) => Promise<{
      readonly status: "success" | "reverted";
    }>)
    | null;
  readonly refreshProductData: () => Promise<void>;
}

export function useCommitmentCancellationController({
  api,
  account,
  manager,
  chainId,
  sender,
  transactionCoordinator,
  ensureTransactionNetwork,
  waitForReceipt,
  refreshProductData,
}: UseCommitmentCancellationControllerInput) {
  const [cancellingId, setCancellingId] =
    useState<string | null>(null);
  const [status, setStatus] =
    useState<string | null>(null);
  const [error, setError] =
    useState<string | null>(null);

  const cancelCommitment =
    useCallback(
      async (
        commitment: CommitmentDto,
      ): Promise<boolean> => {
        if (
          commitment.state !== "ACTIVE"
          || !commitment.onchainCommitmentId
        ) {
          setError(
            "Only an active commitment can be cancelled.",
          );
          return false;
        }

        if (
          !api
          || !account
          || !manager
          || !chainId
          || !waitForReceipt
        ) {
          setError(
            "Your Kept account is not ready yet.",
          );
          return false;
        }

        setCancellingId(commitment.id);
        setStatus(null);
        setError(null);

        let succeeded = false;

        const acquired =
          await transactionCoordinator.run(
            "commitment",
            async () => {
              try {
                await ensureTransactionNetwork();

                setStatus(
                  "Cancelling commitment…",
                );

                const transactionHash =
                  await sender.sendTransaction(
                    buildCancelCommitmentTransaction({
                      manager,
                      chainId,
                      commitmentId:
                        commitment.onchainCommitmentId!,
                    }),
                  );

                setStatus(
                  "Confirming cancellation…",
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

                await api.cancelCommitment(
                  commitment,
                  {
                    onchainCommitmentId:
                      commitment.onchainCommitmentId!,
                    owner: account,
                  },
                );

                await refreshProductData();

                setStatus(null);
                succeeded = true;
              } catch (caught) {
                diagnostics.error(
                  "commitment.cancel_failed",
                  caught,
                  {
                    commitmentId:
                      commitment.id,
                  },
                );

                setStatus(null);
                setError(
                  consumerErrorMessage(
                    caught,
                    "We could not cancel this commitment. Try again.",
                  ),
                );
              }
            },
          );

        if (!acquired) {
          setError(
            "Another account action is still being processed. Try again in a moment.",
          );
        }

        setCancellingId(null);
        return succeeded;
      },
      [
        account,
        api,
        chainId,
        ensureTransactionNetwork,
        manager,
        refreshProductData,
        sender,
        transactionCoordinator,
        waitForReceipt,
      ],
    );

  const dismiss =
    useCallback(
      () => {
        setStatus(null);
        setError(null);
      },
      [],
    );

  return {
    cancellingId,
    status,
    error,
    cancelCommitment,
    dismiss,
  };
}
