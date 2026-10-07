import type { CommitmentDto, GoalDto } from "@/api/kept-api";
import { ArrowRight, Plus, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CommitmentCard } from "@/features/commitments/components/CommitmentCard";
import { formatUsdc } from "@/features/savings/format";
import { goalFundingPercent, type GoalFundingEntry } from "../funding";

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
    <Card className="overflow-hidden shadow-none">
      <CardHeader className="gap-5 p-5 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-caption font-medium text-muted-foreground">
              Goal
            </p>

            <h3 className="mt-1 truncate text-h3 font-semibold tracking-tight">
              {goal.name}
            </h3>
          </div>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onOpen(goal)}
            aria-label={`Open ${goal.name} details`}
          >
            <ArrowRight className="size-4" />
          </Button>
        </div>

        <div>
          <div className="flex items-baseline gap-2">
            <p className="text-h2 font-semibold tracking-tight tabular-nums">
              {allocatedAssets === null ? "—" : `£${formatUsdc(allocatedAssets)}`}
            </p>

            <span className="text-caption text-muted-foreground">
              of {targetAmount(goal)} USDC
            </span>
          </div>

          <div className="mt-4 space-y-2">
            <Progress
              value={progress.visualPercent}
              aria-label={`${progress.labelPercent}% of target`}
            />

            <div className="flex items-center justify-between gap-4 text-caption">
              <span className="font-medium text-foreground tabular-nums">
                {allocatedAssets === null
                  ? "Savings unavailable"
                  : `${progress.labelPercent}% complete`}
              </span>

              {goal.targetDate ? (
                <span className="text-muted-foreground">
                  Target set
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 border-t border-border bg-surface p-5 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-label font-medium">Commitment</p>
            <p className="mt-1 text-caption text-muted-foreground">
              Keep a weekly saving habit for this goal.
            </p>
          </div>

          {(!commitment || commitment.state === "DRAFT") ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAddCommitment(goal)}
            >
              <Plus className="size-4" />
              {commitment ? "Retry" : "Add"}
            </Button>
          ) : null}
        </div>

        {commitment ? (
          <CommitmentCard commitment={commitment} compact />
        ) : (
          <button
            type="button"
            className="w-full rounded-md border border-dashed border-border bg-background px-4 py-4 text-left text-caption text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            onClick={() => onAddCommitment(goal)}
          >
            Add a commitment to keep yourself moving towards this goal.
          </button>
        )}

        <Button
          variant="outline"
          className="w-full justify-between"
          disabled={!funding}
          onClick={() => onManageSavings(goal)}
        >
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal className="size-4" />
            Manage savings
          </span>

          <ArrowRight className="size-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
