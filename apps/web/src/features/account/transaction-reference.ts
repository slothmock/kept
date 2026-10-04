import type {
  TransactionDto,
} from "@/api/kept-api";

export function transactionSupportReference(
  transaction: TransactionDto,
): string | null {
  if (
    transaction.type !== "fiat_withdrawal"
    || !transaction.externalReference?.trim()
  ) {
    return null;
  }

  return `MoonPay reference: ${transaction.externalReference.trim()}`;
}
