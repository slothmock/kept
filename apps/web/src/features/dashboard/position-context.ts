import type { Address } from "viem";

import type { PositionState } from "@/features/savings/BalanceCard";
import type { VaultPosition } from "@/vault/position";

export type BoundPositionState =
  | Exclude<PositionState, { readonly kind: "ready" }>
  | {
      readonly kind: "ready";
      readonly account: Address;
      readonly chainId: number;
      readonly position: VaultPosition;
    };

interface CurrentPositionContext {
  readonly account: Address | null;
  readonly chainId: number | null;
}

export function currentPositionState(
  state: BoundPositionState,
  context: CurrentPositionContext,
): PositionState {
  if (state.kind !== "ready") return state;
  if (
    !context.account
    || context.chainId === null
    || state.account.toLowerCase() !== context.account.toLowerCase()
    || state.chainId !== context.chainId
  ) {
    return { kind: "unavailable" };
  }

  return state;
}
