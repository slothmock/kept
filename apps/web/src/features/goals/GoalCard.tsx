import type { CommitmentDto, GoalDto } from "@/api/kept-api";
import { ArrowRight, Plus, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CommitmentCard } from "@/features/commitments/CommitmentCard";
import { formatUsdc } from "@/features/savings/format";
import { goalFundingPercent, type GoalFundingEntry } from "./funding";

function targetAmountAtomic(goal: GoalDto): bigint {
  try {
    return BigInt(goal.targetAmountAtomic);
  } catch {
    return 0n;
  }
}

function targetAmount(goal: GoalDto): string {
  return formatUsdc(targetAmountAtomic(goal));
}

interface GoalCardProps {
  readonly goal: GoalDto;
  readonly funding: GoalFundingEntry | null;
  readonly commitment?: CommitmentDto | undefined;
  readonly onManageSavings: (goal: GoalDto) => void;
  readonly onAddCommitment: (goal: GoalDto) => void;
  readonly onOpen: (goal: GoalDto) => void;
}

export function GoalCard({
  goal,
  funding,
  commitment,
  onManageSavings,
  onAddCommitment,
  onOpen,
}: GoalCardProps) {
  const target = targetAmountAtomic(goal);
  const allocatedAssets = funding?.allocatedAssets ?? null;
  const progress = goalFundingPercent(allocatedAssets ?? 0n, target);

  return (
    <Card className="overflow-hidden shadow-none transition-shadow hover:shadow-sm">
      <CardHeader className="gap-5 pb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Goal
            </p>

            <h3 className="truncate text-xl font-semibold tracking-tight">
              {goal.name}
            </h3>
          </div>
        </div>

        <div>
          <div className="flex items-end gap-2">
            <p className="text-3xl font-semibold tracking-tight tabular-nums">
              {allocatedAssets === null ? "—" : formatUsdc(allocatedAssets)}
            </p>

            {allocatedAssets !== null && (
              <span className="pb-1 text-sm text-muted-foreground">USDC</span>
            )}
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            saved of {targetAmount(goal)} USDC
          </p>
        </div>

        <div className="space-y-2">
          <Progress
            value={progress.visualPercent}
            aria-label={`${progress.labelPercent}% of target`}
          />

          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="font-medium tabular-nums">
              {allocatedAssets === null
                ? "Savings unavailable"
                : `${progress.labelPercent}% of target`}
            </span>

            {goal.targetDate && (
              <span className="text-muted-foreground">Target set</span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 border-t bg-muted/10 pt-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Current commitment</p>

          {(!commitment || commitment.state === "DRAFT") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAddCommitment(goal)}
            >
              <Plus className="size-4" />
              {commitment ? "Retry setup" : "Add"}
            </Button>
          )}
        </div>

        {commitment ? (
          <CommitmentCard commitment={commitment} compact />
        ) : (
          <button
            type="button"
            className="w-full rounded-lg border border-dashed p-4 text-left text-sm text-muted-foreground transition hover:border-primary/40 hover:bg-accent/40 hover:text-foreground"
            onClick={() => onAddCommitment(goal)}
          >
            Add a commitment to help you keep moving towards this goal.
          </button>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <Button disabled={!funding} onClick={() => onManageSavings(goal)}>
            <SlidersHorizontal className="size-4" />
            Manage savings
          </Button>

          <Button
            variant="ghost"
            className="justify-between"
            onClick={() => onOpen(goal)}
          >
            Goal details
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
