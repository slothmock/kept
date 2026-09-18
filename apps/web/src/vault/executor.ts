import type { Hex } from "viem";

import type { UnsignedVaultTransaction } from "./transactions.js";

interface TransactionSender {
  sendTransaction(transaction: UnsignedVaultTransaction): Promise<Hex>;
}

interface TransactionReceipts {
  waitForTransactionReceipt(input: { readonly hash: Hex }): Promise<{
    readonly status: "success" | "reverted";
  }>;
}

export interface SubmitVaultDepositInput {
  readonly allowance: bigint;
  readonly assets: bigint;
  readonly approval: UnsignedVaultTransaction;
  readonly deposit: UnsignedVaultTransaction;
  readonly sender: TransactionSender;
  readonly receipts: TransactionReceipts;
}

export interface SubmittedVaultDeposit {
  readonly approvalHash: Hex | null;
  readonly depositHash: Hex;
}

export interface SubmitVaultWithdrawalInput {
  readonly withdrawal: UnsignedVaultTransaction;
  readonly sender: TransactionSender;
  readonly receipts: TransactionReceipts;
}

export interface SubmittedVaultWithdrawal {
  readonly withdrawalHash: Hex;
}

async function sendAndConfirm(
  transaction: UnsignedVaultTransaction,
  sender: TransactionSender,
  receipts: TransactionReceipts,
): Promise<Hex> {
  const hash = await sender.sendTransaction(transaction);
  const receipt = await receipts.waitForTransactionReceipt({ hash });

  if (receipt.status !== "success") {
    throw new Error("The transaction was not confirmed on Monad.");
  }

  return hash;
}

export async function submitVaultDeposit({
  allowance,
  assets,
  approval,
  deposit,
  sender,
  receipts,
}: SubmitVaultDepositInput): Promise<SubmittedVaultDeposit> {
  const approvalHash = allowance < assets
    ? await sendAndConfirm(approval, sender, receipts)
    : null;
  const depositHash = await sendAndConfirm(deposit, sender, receipts);

  return { approvalHash, depositHash };
}

export async function submitVaultWithdrawal({
  withdrawal,
  sender,
  receipts,
}: SubmitVaultWithdrawalInput): Promise<SubmittedVaultWithdrawal> {
  return { withdrawalHash: await sendAndConfirm(withdrawal, sender, receipts) };
}
