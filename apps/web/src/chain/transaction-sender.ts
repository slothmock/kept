import { useMemo } from "react";
import type { Hex } from "viem";

import { ConsumerError } from "../lib/consumer-error.js";
import type { UnsignedVaultTransaction } from "../vault/transactions.js";

export interface KeptTransactionSender {
  sendTransaction(transaction: UnsignedVaultTransaction): Promise<Hex>;
}

type SponsoredTransactionSender = (
  transaction: UnsignedVaultTransaction,
) => Promise<{ readonly transactionHash: string }>;

export function createBoundTransactionSender(
  sendTransaction: SponsoredTransactionSender | null,
  address: string | null,
): KeptTransactionSender {
  return {
    async sendTransaction(transaction) {
      if (!address || !sendTransaction) {
        throw new ConsumerError("Your Kept account is not ready yet.", {
          code: "wallet_unavailable",
          cause: new Error(
            "No selected wallet is available for this transaction.",
          ),
        });
      }

      const result =
        await sendTransaction(transaction);

      return result.transactionHash as Hex;
    },
  };
}

export function useKeptTransactionSender(
  address: string | null,
  sendTransaction: SponsoredTransactionSender | null,
): KeptTransactionSender {
  return useMemo(
    () =>
      createBoundTransactionSender(
        sendTransaction,
        address,
      ),
    [address, sendTransaction],
  );
}
