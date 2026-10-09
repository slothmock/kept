import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  Leaf,
  RefreshCw,
  Target,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatUsdc } from "../format";

import type {
  PositionState,
  SavingsMarketStatusState,
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
  readonly marketStatusState?: SavingsMarketStatusState;
  readonly allocatedGoalSavings?: bigint | null;
  readonly showActions?: boolean;
  readonly demoYield?: boolean;
  readonly onAddMoney: () => void;
  readonly onWithdraw: () => void;
  readonly onAddToSavings: () => void;
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
  marketStatusState,
  allocatedGoalSavings = null,
  showActions = true,
  demoYield = false,
  onAddMoney,
  onWithdraw,
  onAddToSavings,
  onRefresh,
  stagingFaucetAvailable,
  stagingFaucetClaiming,
  stagingFaucetStatus,
  stagingFaucetError,
  onClaimStagingFaucet,
}: BalanceCardProps) {
  const ready = positionState.kind === "ready";

  const [refreshCooldownSeconds, setRefreshCooldownSeconds] = useState(0);

  useEffect(() => {
    if (refreshCooldownSeconds <= 0) return;

    const timeout = globalThis.setTimeout(() => {
      setRefreshCooldownSeconds((current) => Math.max(0, current - 1));
    }, 1_000);

    return () => globalThis.clearTimeout(timeout);
  }, [refreshCooldownSeconds]);

  const refreshDisabled =
    transactionPending ||
    refreshCooldownSeconds > 0 ||
    positionState.kind === "loading" ||
    savingsPerformanceState.kind === "loading" ||
    savingsPerformanceState.kind === "synchronizing";

  const handleRefresh = () => {
    if (refreshDisabled) return;
    setRefreshCooldownSeconds(10);
    void onRefresh();
  };

  const canWithdraw =
    ready &&
    (positionState.position.withdrawableAssets > 0n ||
      positionState.position.usdcBalance > 0n);

  const earnings =
    savingsPerformanceState.kind === "ready"
      ? savingsPerformanceState.earningsAssets
      : null;

  // Total balance includes external wallet cash as well as vault assets.
  // Don't mislabel the combined amount as an entirely yield-bearing balance.
  const totalBalance = ready
    ? positionState.position.assets + positionState.position.usdcBalance
    : null;

  const netApy =
    marketStatusState?.kind === "ready"
      ? (marketStatusState.netApyBps / 100).toFixed(2)
      : null;

  return (
    <section
      className="overflow-hidden rounded-2xl bg-balance-surface text-balance-foreground shadow-sm"
      aria-labelledby="balance-heading"
    >
      <div className="space-y-7 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h2
                id="balance-heading"
                className="text-sm font-medium text-balance-foreground/75"
              >
                Total balance
              </h2>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={refreshDisabled}
                onClick={handleRefresh}
                className="border border-white/20 text-balance-foreground/75 hover:bg-white/10 hover:text-balance-foreground disabled:border-white/10 disabled:bg-transparent disabled:text-balance-foreground/40"
                aria-label={
                  refreshCooldownSeconds > 0
                    ? `Refresh available in ${refreshCooldownSeconds} seconds`
                    : "Refresh balance"
                }
              >
                <RefreshCw className={`size-3.5 ${refreshCooldownSeconds > 0 ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {positionState.kind === "loading" ? (
              <Skeleton className="mt-4 h-12 w-56 bg-white/15" />
            ) : (
              <p className="mt-3 break-words text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">
                {totalBalance !== null
                  ? `${formatUsdc(totalBalance)} USDC`
                  : "—"}
              </p>
            )}

            {ready ? (
              <p className="mt-3 text-sm text-balance-foreground/70">
                {formatUsdc(positionState.position.assets)} USDC currently earning {demoYield ? "simulated testnet yield" : "yield"}
              </p>
            ) : null}
          </div>

          {netApy && ready ? (
            <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-emerald-200/25 bg-white/10 px-4 py-2 text-sm font-semibold text-balance-foreground">
              <Leaf aria-hidden="true" className="size-4 text-emerald-200" />
              {netApy}% {demoYield ? "Demo APY" : "APY"}
            </span>
          ) : null}
        </div>

        {demoYield ? (
          <p className="text-xs text-balance-foreground/75">
            Testnet demonstration: yield is simulated, not supplied through Aave.
            Deposits, withdrawals and commitment rewards still execute on-chain.
          </p>
        ) : null}

        <div className="grid gap-0 overflow-hidden rounded-xl border border-white/10 bg-white/5 sm:grid-cols-3">
          <div className="flex min-w-0 items-center gap-3 p-4 sm:p-5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10">
              <Wallet aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm text-balance-foreground/70">Available cash</p>
              <p className="mt-1 break-words text-base font-semibold tabular-nums">
                {ready
                  ? `${formatUsdc(positionState.position.usdcBalance)} USDC`
                  : "—"}
              </p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-3 border-t border-white/10 p-4 sm:border-l sm:border-t-0 sm:p-5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10">
              <Target aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm text-balance-foreground/70">Assigned to goals</p>
              <p className="mt-1 break-words text-base font-semibold tabular-nums">
                {allocatedGoalSavings === null
                  ? "—"
                  : `${formatUsdc(allocatedGoalSavings)} USDC`}
              </p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-3 border-t border-white/10 p-4 sm:border-l sm:border-t-0 sm:p-5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10">
              <BarChart3 aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm text-balance-foreground/70">Net earnings</p>
              {savingsPerformanceState.kind === "loading" ? (
                <Skeleton className="mt-2 h-6 w-24 bg-white/15" />
              ) : savingsPerformanceState.kind === "synchronizing" ? (
                <p className="mt-1 text-sm font-medium text-balance-foreground/75">
                  {savingsPerformanceState.progressPercent === null
                    ? "Synchronising…"
                    : `Synchronising… ${Math.floor(savingsPerformanceState.progressPercent)}%`}
                </p>
              ) : savingsPerformanceState.kind === "ready" ? (
                <p className="mt-1 break-words text-base font-semibold tabular-nums">
                  {earnings !== null && earnings > 0n ? "+" : ""}
                  {formatUsdc(earnings ?? 0n)} USDC
                </p>
              ) : (
                <p className="mt-1 text-base font-semibold">—</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={!ready || transactionPending}
            onClick={onAddToSavings}
            className="bg-surface text-foreground hover:bg-accent disabled:bg-white/10 disabled:text-white/45"
          >
            <ArrowDownToLine className="size-4" />
            Add to savings
          </Button>
          <Button
            variant="outline"
            disabled={!canWithdraw || transactionPending}
            onClick={onWithdraw}
            className="border-white/30 bg-transparent text-balance-foreground hover:bg-white/10 hover:text-balance-foreground disabled:border-white/10 disabled:bg-transparent disabled:text-white/35"
          >
            <ArrowUpFromLine className="size-4" />
            Withdraw
          </Button>
          {showActions ? (
            <Button
              variant="ghost"
              disabled={!ready || transactionPending}
              onClick={onAddMoney}
              className="text-balance-foreground/80 hover:bg-white/10 hover:text-balance-foreground"
            >
              Add money
            </Button>
          ) : null}
          {stagingFaucetAvailable ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={stagingFaucetClaiming || transactionPending}
              onClick={onClaimStagingFaucet}
              className="text-balance-foreground/70 hover:bg-white/10 hover:text-balance-foreground disabled:bg-transparent disabled:text-white/35"
            >
              {stagingFaucetClaiming ? "Getting test funds…" : "Get test funds"}
            </Button>
          ) : null}
        </div>

        {stagingFaucetStatus ? (
          <p className="text-sm text-balance-foreground/75" aria-live="polite">
            {stagingFaucetStatus}
          </p>
        ) : null}
        {stagingFaucetError ? (
          <p className="text-sm text-red-100" role="alert">
            {stagingFaucetError}
          </p>
        ) : null}
        {positionState.kind === "error" ? (
          <p className="text-sm text-red-100" role="alert">
            {positionState.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
