import { Skeleton } from "@/components/ui/skeleton";

import type {
  SavingsMarketStatusState,
} from "@/features/savings/state";

export type {
  SavingsMarketStatusState,
} from "@/features/savings/state";

interface SavingsMarketStatusProps {
  readonly state: SavingsMarketStatusState;
}

function formatCompactUsdc(assets: bigint): string {
  const value = Number(assets) / 1_000_000;

  if (!Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat(undefined, {
    notation: Math.abs(value) >= 10_000 ? "compact" : "standard",

    maximumFractionDigits: Math.abs(value) >= 10_000 ? 1 : 2,
  }).format(value);
}

export function SavingsMarketStatus({ state }: SavingsMarketStatusProps) {
  return (
    <div className="grid w-full overflow-hidden rounded-xl border bg-card/80 shadow-sm sm:grid-cols-3 lg:w-auto lg:min-w-[34rem]">
      <div className="px-4 py-3">
        <p className="text-xs text-muted-foreground">Deposit capacity</p>

        {state.kind === "loading" ? (
          <Skeleton className="mt-2 h-5 w-28" />
        ) : state.kind === "ready" &&
          state.suppliedAssets !== null &&
          state.supplyCapAssets !== null ? (
          <>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {formatCompactUsdc(state.suppliedAssets)}
              {" / "}
              {formatCompactUsdc(state.supplyCapAssets)} USDC
            </p>
          </>
        ) : state.kind === "ready" && state.supplyCapAssets === null ? (
          <>
            <p className="mt-1 text-sm font-semibold">No fixed cap</p>

            <p className="mt-1 text-xs text-muted-foreground">
              Deposits currently uncapped
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">—</p>
        )}
      </div>

      <div className="border-t px-4 py-3 sm:border-l sm:border-t-0">
        <p className="text-xs text-muted-foreground">TVL</p>

        {state.kind === "loading" ? (
          <Skeleton className="mt-2 h-5 w-24" />
        ) : state.kind === "ready" ? (
          <>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {formatCompactUsdc(state.tvlAssets)} USDC
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">—</p>
        )}
      </div>

      <div className="border-t px-4 py-3 sm:border-l sm:border-t-0">
        <p className="text-xs text-muted-foreground">Current APY</p>

        {state.kind === "loading" ? (
          <Skeleton className="mt-2 h-5 w-16" />
        ) : state.kind === "ready" ? (
          <>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {(state.netApyBps / 100).toFixed(2)}%
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">—</p>
        )}
      </div>
    </div>
  );
}
