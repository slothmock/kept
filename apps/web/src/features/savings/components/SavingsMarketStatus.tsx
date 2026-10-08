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

function availableDepositCapacity(
  suppliedAssets: bigint,
  supplyCapAssets: bigint,
): bigint {
  return supplyCapAssets > suppliedAssets
    ? supplyCapAssets - suppliedAssets
    : 0n;
}

export function SavingsMarketStatus({ state }: SavingsMarketStatusProps) {
  return (
    <div className="flex w-full flex-wrap gap-2 lg:w-auto lg:justify-end">
      <div className="min-w-40 rounded-lg border border-border bg-surface px-4 py-3">
        <p className="text-caption text-muted-foreground">
          Available to deposit
        </p>

        {state.kind === "loading" ? (
          <Skeleton className="mt-2 h-5 w-24" />
        ) : state.kind === "ready"
          && state.suppliedAssets !== null
          && state.supplyCapAssets !== null ? (
          <p className="mt-1 text-label font-semibold tabular-nums">
            {formatCompactUsdc(
              availableDepositCapacity(
                state.suppliedAssets,
                state.supplyCapAssets,
              ),
            )} USDC
          </p>
        ) : state.kind === "ready" && state.supplyCapAssets === null ? (
          <p className="mt-1 text-label font-semibold">
            No fixed cap
          </p>
        ) : (
          <p className="mt-1 text-label text-muted-foreground">—</p>
        )}
      </div>

      <div className="min-w-32 rounded-lg border border-border bg-surface px-4 py-3">
        <p className="text-caption text-muted-foreground">
          Pool TVL
        </p>

        {state.kind === "loading" ? (
          <Skeleton className="mt-2 h-5 w-20" />
        ) : state.kind === "ready" ? (
          <p className="mt-1 text-label font-semibold tabular-nums">
            {formatCompactUsdc(state.tvlAssets)} USDC
          </p>
        ) : (
          <p className="mt-1 text-label text-muted-foreground">—</p>
        )}
      </div>

      <div className="min-w-28 rounded-lg border border-border bg-surface px-4 py-3">
        <p className="text-caption text-muted-foreground">
          Current APY
        </p>

        {state.kind === "loading" ? (
          <Skeleton className="mt-2 h-5 w-14" />
        ) : state.kind === "ready" ? (
          <p className="mt-1 text-label font-semibold tabular-nums text-success">
            {(state.netApyBps / 100).toFixed(2)}%
          </p>
        ) : (
          <p className="mt-1 text-label text-muted-foreground">—</p>
        )}
      </div>
    </div>
  );
}
