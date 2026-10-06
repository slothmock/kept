import { useMemo } from "react";
import {
  useSendTransaction,
} from "@privy-io/react-auth";

import type {
  TransactionSender,
} from "@/wallet/blockchain";
import {
  createPrivyTransactionSender,
  type PrivySendTransaction,
} from "@/wallet/privy-transaction-sender";

export type KeptTransactionSender =
  TransactionSender;

export function createBoundTransactionSender(
  sendTransaction:
    PrivySendTransaction,
  address: string | null,
): KeptTransactionSender {
  return createPrivyTransactionSender(
    sendTransaction,
    address,
  );
}

export function useKeptTransactionSender(
  address: string | null,
): KeptTransactionSender {
  const { sendTransaction } =
    useSendTransaction();

  return useMemo(
    () =>
      createPrivyTransactionSender(
        sendTransaction,
        address,
      ),
    [
      address,
      sendTransaction,
    ],
  );
}
