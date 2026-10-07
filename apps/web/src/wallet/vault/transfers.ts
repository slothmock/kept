import type { Hex } from "viem";

import type {
  TransactionReceiptReader,
  TransactionSender,
} from "@/wallet/blockchain";

import { ConsumerError } from "@/lib/consumer-error";
import type { UnsignedVaultTransaction } from "@/wallet/vault/transactions";

export interface SubmitVaultDepositInput {
  readonly allowance: bigint;
  readonly assets: bigint;
  readonly approval: UnsignedVaultTransaction;
  readonly deposit: UnsignedVaultTransaction;
  readonly beforeSend: (transaction: UnsignedVaultTransaction) => Promise<void>;
  readonly sender: TransactionSender;
  readonly receipts: TransactionReceiptReader;
}

export interface SubmittedVaultDeposit {
  readonly approvalHash: Hex | null;
  readonly depositHash: Hex;
}

export interface SubmitVaultWithdrawalInput {
  readonly withdrawal: UnsignedVaultTransaction;
  readonly beforeSend: (transaction: UnsignedVaultTransaction) => Promise<void>;
  readonly sender: TransactionSender;
  readonly receipts: TransactionReceiptReader;
}

export interface SubmittedVaultWithdrawal {
  readonly withdrawalHash: Hex;
}

async function sendAndConfirm(
  transaction: UnsignedVaultTransaction,
  beforeSend: (transaction: UnsignedVaultTransaction) => Promise<void>,
  sender: TransactionSender,
  receipts: TransactionReceiptReader,
): Promise<Hex> {
  await beforeSend(transaction);
  const hash = await sender.sendTransaction(transaction);
  const receipt = await receipts.waitForTransactionReceipt({ hash });

  if (receipt.status !== "success") {
    throw new ConsumerError("The transaction was not completed. Your money was not moved.", {
      code: "contract_reverted",
      cause: new Error("The transaction was not confirmed on Monad."),
    });
  }

  return hash;
}

export async function submitVaultDeposit({
  allowance,
  assets,
  approval,
  deposit,
  beforeSend,
  sender,
  receipts,
}: SubmitVaultDepositInput): Promise<SubmittedVaultDeposit> {
  const approvalHash = allowance < assets
    ? await sendAndConfirm(approval, beforeSend, sender, receipts)
    : null;
  const depositHash = await sendAndConfirm(deposit, beforeSend, sender, receipts);

  return { approvalHash, depositHash };
}

export async function submitVaultWithdrawal({
  withdrawal,
  beforeSend,
  sender,
  receipts,
}: SubmitVaultWithdrawalInput): Promise<SubmittedVaultWithdrawal> {
  return { withdrawalHash: await sendAndConfirm(withdrawal, beforeSend, sender, receipts) };
}
