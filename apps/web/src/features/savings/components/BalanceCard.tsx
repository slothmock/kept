import {
  useEffect,
  useState,
} from "react";

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatUsdc } from "../format";

import type {
  PositionState,
  SavingsPerformanceState,
} from "@/features/savings/state";

export type {
  PositionState,
  SavingsPerformanceState,
} from "@/features/savings/state";

interface BalanceCardProps {
  readonly positionState: PositionState;
  readonly transactionPending: boolean;
  readonly savingsPerformanceState: SavingsPerformanceState;
  readonly onAddMoney: () => void;
  readonly onWithdraw: () => void;
  readonly onRefresh: () => Promise<void>;
  readonly stagingFaucetAvailable: boolean;
  readonly stagingFaucetClaiming: boolean;
  readonly stagingFaucetStatus: string | null;
  readonly stagingFaucetError: string | null;
  readonly onClaimStagingFaucet: () => void;
}

export function BalanceCard({
  positionState,
  transactionPending,
  savingsPerformanceState,
  onAddMoney,
  onWithdraw,
  onRefresh,
  stagingFaucetAvailable,
  stagingFaucetClaiming,
  stagingFaucetStatus,
  stagingFaucetError,
  onClaimStagingFaucet,
}: BalanceCardProps) {
  const ready = positionState.kind === "ready";

  const [refreshCooldownSeconds, setRefreshCooldownSeconds] =
    useState(0);

  useEffect(() => {
    if (refreshCooldownSeconds <= 0) {
      return;
    }

    const timeout = globalThis.setTimeout(() => {
      setRefreshCooldownSeconds(
        (current) => Math.max(0, current - 1),
      );
    }, 1_000);

    return () => {
      globalThis.clearTimeout(timeout);
    };
  }, [refreshCooldownSeconds]);

  const refreshDisabled =
    transactionPending
    || refreshCooldownSeconds > 0
    || positionState.kind === "loading"
    || savingsPerformanceState.kind === "loading"
    || savingsPerformanceState.kind === "synchronizing";

  const handleRefresh = () => {
    if (refreshDisabled) {
      return;
    }

    setRefreshCooldownSeconds(10);
    void onRefresh();
  };

  const canWithdraw =
    ready
    && (
      positionState.position.withdrawableAssets > 0n
      || positionState.position.usdcBalance > 0n
    );

  const earnings =
    savingsPerformanceState.kind === "ready"
      ? savingsPerformanceState.earningsAssets
      : null;

  return (
    <section
      className="overflow-hidden rounded-xl bg-balance-surface text-balance-foreground"
      aria-labelledby="balance-heading"
    >
      <div className="p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <p
                id="balance-heading"
                className="text-caption font-medium text-balance-foreground/75"
              >
                Total balance
              </p>

              <Button
                variant="ghost"
                size="icon-xs"
                disabled={refreshDisabled}
                onClick={handleRefresh}
                className="text-balance-foreground/70 hover:bg-white/10 hover:text-balance-foreground disabled:bg-transparent disabled:text-balance-foreground/40"
                aria-label={
                  refreshCooldownSeconds > 0
                    ? `Refresh available in ${refreshCooldownSeconds} seconds`
                    : "Refresh balance"
                }
              >
                <RefreshCw
                  className={
                    refreshCooldownSeconds > 0
                      ? "size-3.5 animate-spin"
                      : "size-3.5"
                  }
                />
              </Button>
            </div>

            {positionState.kind === "loading" ? (
              <Skeleton className="mt-3 h-12 w-52 bg-white/15" />
            ) : (
              <p className="mt-2 text-balance font-semibold tracking-tight tabular-nums">
                {ready
                  ? `£${formatUsdc(positionState.position.assets)}`
                  : "—"}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!ready || transactionPending}
              onClick={onAddMoney}
              className="bg-surface text-foreground hover:bg-accent disabled:bg-white/10 disabled:text-white/45"
            >
              <ArrowDownToLine className="size-4" />
              Add money
            </Button>

            <Button
              variant="outline"
              disabled={!canWithdraw || transactionPending}
              onClick={onWithdraw}
              className="border-white/25 bg-transparent text-balance-foreground hover:bg-white/10 hover:text-balance-foreground disabled:border-white/10 disabled:bg-transparent disabled:text-white/35"
            >
              <ArrowUpFromLine className="size-4" />
              Withdraw
            </Button>
          </div>
        </div>

        <div className="mt-8 grid gap-4 border-t border-white/15 pt-5 sm:grid-cols-3">
          <div>
            <p className="text-caption text-balance-foreground/65">
              Available cash
            </p>
            <p className="mt-1 text-body font-semibold tabular-nums">
              {ready
                ? `£${formatUsdc(positionState.position.usdcBalance)}`
                : "—"}
            </p>
          </div>

          <div>
            <p className="text-caption text-balance-foreground/65">
              Saving toward goals
            </p>
            <p className="mt-1 text-body font-semibold tabular-nums">
              {ready
                ? `£${formatUsdc(
                  positionState.position.assets
                  - positionState.position.usdcBalance,
                )}`
                : "—"}
            </p>
          </div>

          <div>
            <p className="text-caption text-balance-foreground/65">
              Earned so far
            </p>

            {savingsPerformanceState.kind === "loading" ? (
              <Skeleton className="mt-2 h-6 w-24 bg-white/15" />
            ) : savingsPerformanceState.kind === "synchronizing" ? (
              <p className="mt-1 text-caption font-medium text-balance-foreground/75">
                {savingsPerformanceState.progressPercent === null
                  ? "Synchronising…"
                  : `Synchronising… ${Math.floor(
                    savingsPerformanceState.progressPercent,
                  )}%`}
              </p>
            ) : savingsPerformanceState.kind === "ready" ? (
              <p className="mt-1 text-body font-semibold tabular-nums">
                {earnings !== null && earnings > 0n ? "+" : ""}
                £{formatUsdc(earnings ?? 0n)}
              </p>
            ) : (
              <p className="mt-1 text-body font-semibold">—</p>
            )}
          </div>
        </div>

        {stagingFaucetAvailable ? (
          <div className="mt-5 border-t border-white/15 pt-5">
            <Button
              variant="ghost"
              size="sm"
              disabled={stagingFaucetClaiming || transactionPending}
              onClick={onClaimStagingFaucet}
              className="text-balance-foreground/75 hover:bg-white/10 hover:text-balance-foreground disabled:bg-transparent disabled:text-white/35"
            >
              {stagingFaucetClaiming
                ? "Getting test funds…"
                : "Get test funds"}
            </Button>
          </div>
        ) : null}

        {stagingFaucetStatus ? (
          <p
            className="mt-4 text-caption text-balance-foreground/75"
            aria-live="polite"
          >
            {stagingFaucetStatus}
          </p>
        ) : null}

        {stagingFaucetError ? (
          <p className="mt-4 text-caption text-red-100" role="alert">
            {stagingFaucetError}
          </p>
        ) : null}

        {positionState.kind === "error" ? (
          <p className="mt-4 text-caption text-red-100">
            {positionState.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
