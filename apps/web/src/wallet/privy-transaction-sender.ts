import type { Hex } from "viem";

import type {
  TransactionSender,
} from "@/wallet/blockchain";
import { ConsumerError } from "@/lib/consumer-error";
import type {
  UnsignedVaultTransaction,
} from "@/wallet/vault/transactions";

export type PrivySendTransaction = (
  transaction:
    UnsignedVaultTransaction,
  options?: {
    readonly address?: string;
    readonly sponsor?: boolean;
  },
) => Promise<{
  readonly hash: Hex;
}>;

export function createPrivyTransactionSender(
  sendTransaction:
    PrivySendTransaction,
  address: string | null,
): TransactionSender {
  return {
    async sendTransaction(
      transaction,
    ) {
      if (!address) {
        throw new ConsumerError(
          "Your Kept account is not ready yet.",
          {
            code:
              "wallet_unavailable",
            cause:
              new Error(
                "No selected wallet is available for this transaction.",
              ),
          },
        );
      }

      const result =
        await sendTransaction(
          transaction,
          {
            address,
            sponsor: true,
          },
        );

      return result.hash;
    },
  };
}
