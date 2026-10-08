/**
 * Decide whether a separately verified vault Deposit log can safely create a
 * fresh-share credit. Never retroactively upgrade UNKNOWN/reconciliation lots:
 * they might already have been transferred, spent or mixed with other credits.
 */
export type DepositAttributionDecision =
  | { readonly kind: "CREDIT"; readonly shares: bigint }
  | { readonly kind: "ALREADY_REFLECTED" };

export function planFreshDepositAttribution(input: {
  readonly mintedShares: bigint;
  readonly currentVaultShares: bigint;
  readonly ledgerShares: bigint;
}): DepositAttributionDecision {
  const {mintedShares, currentVaultShares, ledgerShares} = input;
  if (mintedShares <= 0n || currentVaultShares < 0n || ledgerShares < 0n) {
    throw new Error("Invalid deposit attribution balances");
  }
  if (ledgerShares > currentVaultShares) {
    throw new Error("Ledger exceeds the live vault position");
  }
  const gap = currentVaultShares - ledgerShares;
  if (gap === mintedShares) {
    return {kind: "CREDIT", shares: mintedShares};
  }
  if (gap === 0n) {
    return {kind: "ALREADY_REFLECTED"};
  }
  throw new Error("Deposit cannot be uniquely attributed to the observed vault share gap");
}
