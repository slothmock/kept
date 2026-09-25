import {
  ArrowDownToLine,
  ArrowUpFromLine,
  PiggyBank,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { GoalFundingState } from "@/features/goals/funding";
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

interface BalanceCardProps {
  readonly positionState: PositionState;
  readonly goalFundingState: GoalFundingState;
  readonly activeGoalCount: number;
  readonly transactionPending: boolean;
  readonly onAddMoney: () => void;
  readonly onWithdraw: () => void;
}

export function BalanceCard({
  positionState,
  goalFundingState,
  activeGoalCount,
  transactionPending,
  onAddMoney,
  onWithdraw,
}: BalanceCardProps) {
  const ready = positionState.kind === "ready";

  const canWithdraw =
    ready &&
    positionState.position.withdrawableAssets > 0n;

  const funding =
    goalFundingState.kind === "loading"
      ? null
      : goalFundingState.funding ?? null;

  const unallocatedAssets =
    funding &&
    ready &&
    funding.totalVaultShares === 0n &&
    positionState.position.shares > 0n
      ? positionState.position.assets
      : funding?.unallocatedAssets ?? null;

  return (
    <Card className="overflow-hidden border-primary/10 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--card)_94%,var(--primary)),var(--card))] shadow-none">
      <CardContent className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <div className="mb-6 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <PiggyBank className="size-4" />
            Your savings
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">
                Total savings
              </p>

              {positionState.kind === "loading" ? (
                <Skeleton className="mt-2 h-10 w-44" />
              ) : (
                <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">
                  {ready
                    ? `${formatUsdc(
                        positionState.position.assets,
                      )} USDC`
                    : "—"}
                </p>
              )}
            </div>

            <div>
              <p className="text-sm text-muted-foreground">
                Assigned to goals
              </p>

              <p className="mt-1 text-xl font-semibold tabular-nums">
                {funding
                  ? `${formatUsdc(
                      funding.totalAllocatedAssets,
                    )} USDC`
                  : "—"}
              </p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">
                Available to assign
              </p>

              <p className="mt-1 text-xl font-semibold tabular-nums">
                {unallocatedAssets === null
                  ? "—"
                  : `${formatUsdc(
                      unallocatedAssets,
                    )} USDC`}
              </p>
            </div>
          </div>

          <p className="mt-3 text-sm text-muted-foreground">
            {activeGoalCount === 0
              ? "Create a goal to give your savings some direction."
              : activeGoalCount === 1
                ? "1 active savings goal."
                : `${activeGoalCount} active savings goals.`}
          </p>

          {positionState.kind === "error" && (
            <p className="mt-3 text-sm text-destructive">
              {positionState.message}
            </p>
          )}

          {goalFundingState.kind === "error" && (
            <p className="mt-3 text-sm text-destructive">
              {goalFundingState.message}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!ready || transactionPending}
            onClick={onAddMoney}
          >
            <ArrowDownToLine className="size-4" />
            Add money
          </Button>

          <Button
            variant="outline"
            disabled={
              !canWithdraw || transactionPending
            }
            onClick={onWithdraw}
          >
            <ArrowUpFromLine className="size-4" />
            Withdraw
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}