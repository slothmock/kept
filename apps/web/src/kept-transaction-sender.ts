import { useCallback } from "react";
import { useSendTransaction } from "@privy-io/react-auth";
import type { Hex } from "viem";

import type { UnsignedVaultTransaction } from "./vault-transactions.js";

export interface KeptTransactionSender {
  sendTransaction(transaction: UnsignedVaultTransaction): Promise<Hex>;
}

export function useKeptTransactionSender(): KeptTransactionSender {
  const { sendTransaction } = useSendTransaction();

  return {
    sendTransaction: useCallback(async (transaction) => {
      const result = await sendTransaction(transaction);
      return result.hash;
    }, [sendTransaction]),
  };
}
