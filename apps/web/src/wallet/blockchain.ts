import type { Hex } from "viem";

import type {
  UnsignedVaultTransaction,
} from "@/wallet/vault/transactions";

export interface TransactionSender {
  sendTransaction(
    transaction:
      UnsignedVaultTransaction,
  ): Promise<Hex>;
}

export interface TransactionReceiptReader {
  waitForTransactionReceipt(
    input: {
      readonly hash: Hex;
    },
  ): Promise<{
    readonly status:
      "success"
      | "reverted";
  }>;
}

export interface ContractReader {
  readContract(
    input: unknown,
  ): Promise<bigint>;
}

export interface ChainIdReader {
  getChainId(): Promise<number>;
}

export interface MulticallReader {
  multicall(
    input: unknown,
  ): Promise<readonly unknown[]>;
}
