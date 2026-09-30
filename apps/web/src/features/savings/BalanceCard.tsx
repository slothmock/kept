import {
  ArrowDownToLine,
  ArrowUpFromLine,
  PiggyBank,
  RefreshCw,
  TrendingUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { VaultPosition } from "@/vault/position";
import { formatUsdc } from "./format";

export type PositionState =
  | { readonly kind: "unavailable" }
  | { readonly kind: "loading" }
  | {
      readonly kind: "ready";
      readonly position: VaultPosition;
    }
  | {
      readonly kind: "error";
      readonly message: string;
    };

type SavingsPerformanceState =
  | { readonly kind: "unavailable" }
  | { readonly kind: "loading" }
  | {
      readonly kind: "ready";
      readonly earningsAssets: bigint;
    }
  | { readonly kind: "error" };

interface BalanceCardProps {
  readonly positionState: PositionState;
  readonly transactionPending: boolean;
  readonly savingsPerformanceState: SavingsPerformanceState;
  readonly onAddMoney: () => void;
  readonly onAddToSavings: () => void;
  readonly onWithdraw: () => void;
  readonly onRefresh: () => void;
}

export function BalanceCard({
  positionState,
  transactionPending,
  savingsPerformanceState,
  onAddMoney,
  onAddToSavings,
  onWithdraw,
  onRefresh,
}: BalanceCardProps) {
  const ready = positionState.kind === "ready";

  const canWithdraw = ready && positionState.position.withdrawableAssets > 0n;

  const earnings =
    savingsPerformanceState.kind === "ready"
      ? savingsPerformanceState.earningsAssets
      : null;

  const hasAvailableCash = ready && positionState.position.usdcBalance > 0n;

  return (
    <Card className="overflow-hidden border-primary/10 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--card)_94%,var(--primary)),var(--card))] shadow-none">
      <CardContent className="p-6 sm:p-8">
        <div className="mb-6 flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground">
          <div className="flex items-center gap-2">
            <PiggyBank className="size-4" />
            Your account
          </div>

          <Button
            variant="ghost"
            size="sm"
            disabled={transactionPending}
            onClick={onRefresh}
          >
            <RefreshCw className="size-4" />
            Refresh
          </Button>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Kept savings</p>

            {positionState.kind === "loading" ? (
              <Skeleton className="mt-2 h-10 w-44" />
            ) : (
              <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">
                {ready
                  ? `${formatUsdc(positionState.position.assets)} USDC`
                  : "—"}
              </p>
            )}

            <p className="mt-2 text-sm text-muted-foreground">
              Money currently saved with Kept.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!ready || transactionPending}
              onClick={onAddMoney}
            >
              <ArrowDownToLine className="size-4" />
              Deposit
            </Button>

            <Button
              variant="outline"
              disabled={!canWithdraw || transactionPending}
              onClick={onWithdraw}
            >
              <ArrowUpFromLine className="size-4" />
              Withdraw
            </Button>
          </div>
        </div>

        <div className="mt-8 border-t pt-6">
          <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/20 px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="grid size-9 place-items-center rounded-full bg-primary/10 text-primary">
                <TrendingUp className="size-4" />
              </div>

              <div>
                <p className="text-sm font-medium">Net earnings</p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Growth after fees.
                </p>
              </div>
            </div>

            {savingsPerformanceState.kind === "loading" ? (
              <Skeleton className="h-6 w-24" />
            ) : savingsPerformanceState.kind === "ready" ? (
              <p className="text-lg font-semibold tabular-nums">
                {earnings !== null && earnings > 0n ? "+" : ""}
                {formatUsdc(earnings ?? 0n)} USDC
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </div>
        </div>

        <div className="mt-8 border-t pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Available cash</p>

              {positionState.kind === "loading" ? (
                <Skeleton className="mt-2 h-7 w-32" />
              ) : (
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {ready
                    ? `${formatUsdc(positionState.position.usdcBalance)} USDC`
                    : "—"}
                </p>
              )}

              <p className="mt-1 text-sm text-muted-foreground">
                Ready to add to your savings.
              </p>
            </div>

            <Button
              variant="outline"
              disabled={!hasAvailableCash || transactionPending}
              onClick={onAddMoney}
            >
              Add to savings
            </Button>
          </div>
        </div>

        {positionState.kind === "error" && (
          <p className="mt-4 text-sm text-destructive">
            {positionState.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
