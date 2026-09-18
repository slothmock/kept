import { ArrowDownToLine, ArrowUpFromLine, WalletCards } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatUsdc } from "./format";
import type { VaultPosition } from "@/vault/position";

export type PositionState =
  | { readonly kind: "unavailable" }
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly position: VaultPosition }
  | { readonly kind: "error"; readonly message: string };

interface BalanceCardProps {
  readonly positionState: PositionState;
  readonly activeGoalCount: number;
  readonly onAddMoney: () => void;
  readonly onWithdraw: () => void;
}

export function BalanceCard({ positionState, activeGoalCount, onAddMoney, onWithdraw }: BalanceCardProps) {
  const ready = positionState.kind === "ready";
  const canWithdraw = ready && positionState.position.assets > 0n;

  return (
    <Card className="overflow-hidden border-primary/10 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--card)_94%,var(--primary)),var(--card))] shadow-none">
      <CardContent className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <div className="mb-6 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <WalletCards className="size-4" />
            Total in Kept
          </div>

          {positionState.kind === "loading" ? (
            <Skeleton className="h-12 w-52" />
          ) : (
            <p className="text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
              {ready ? `${formatUsdc(positionState.position.assets)} USDC` : "—"}
            </p>
          )}

          <p className="mt-3 text-sm text-muted-foreground">
            {activeGoalCount === 0
              ? "Create a goal to give your savings some direction."
              : `${activeGoalCount} active ${activeGoalCount === 1 ? "goal" : "goals"}.`}
          </p>

          {positionState.kind === "error" && (
            <p className="mt-3 text-sm text-destructive">{positionState.message}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onAddMoney}>
            <ArrowDownToLine className="size-4" />
            Add money
          </Button>
          <Button variant="outline" disabled={!canWithdraw} onClick={onWithdraw}>
            <ArrowUpFromLine className="size-4" />
            Withdraw
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
