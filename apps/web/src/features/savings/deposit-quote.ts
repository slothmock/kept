import { minimumUsdcDepositError, parseUsdcDepositAmount } from "@/lib/usdc-input";
import type { VaultDepositQuote } from "@/wallet/vault/fees";

export type DepositQuoteState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly quote: VaultDepositQuote }
  | { readonly kind: "error"; readonly assets: bigint; readonly message: string };

export function currentDepositQuote(
  state: DepositQuoteState,
  amount: string,
): DepositQuoteState {
  const parsed = parseUsdcDepositAmount(amount);
  if ("error" in parsed || minimumUsdcDepositError(parsed.assets)) return { kind: "idle" };
  if (state.kind === "ready") {
    return parsed.assets === state.quote.assets ? state : { kind: "loading" };
  }
  if (state.kind === "error") {
    return parsed.assets === state.assets ? state : { kind: "loading" };
  }
  if (state.kind === "idle") return { kind: "loading" };

  return state;
}
