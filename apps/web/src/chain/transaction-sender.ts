import { useMemo } from "react";
import { useSendTransaction } from "@privy-io/react-auth";
import type { Hex } from "viem";

import { ConsumerError } from "../lib/consumer-error.js";
import type { UnsignedVaultTransaction } from "../vault/transactions.js";

export interface KeptTransactionSender {
  sendTransaction(transaction: UnsignedVaultTransaction): Promise<Hex>;
}

type PrivySendTransaction = (
  transaction: UnsignedVaultTransaction,
  options?: { readonly address?: string },
) => Promise<{ readonly hash: Hex }>;

export function createBoundTransactionSender(
  sendTransaction: PrivySendTransaction,
  address: string | null,
): KeptTransactionSender {
  return {
    async sendTransaction(transaction) {
      if (!address) {
        throw new ConsumerError("Your Kept account is not ready yet.", {
          code: "wallet_unavailable",
          cause: new Error(
            "No selected wallet is available for this transaction.",
          ),
        });
      }

      const result = await sendTransaction(transaction, {
        address,
      });

      return result.hash;
    },
  };
}

export function useKeptTransactionSender(address: string | null): KeptTransactionSender {
  const { sendTransaction } = useSendTransaction();

  return useMemo(
    () => createBoundTransactionSender(sendTransaction, address),
    [address, sendTransaction],
  );
}
