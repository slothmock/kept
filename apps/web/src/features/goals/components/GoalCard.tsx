import type { GoalDto } from "@/api/kept-api";
import { ArrowRight, Target } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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

function targetDate(goal: GoalDto): string | null {
  if (!goal.targetDate) {
    return null;
  }

  const date = new Date(goal.targetDate);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

interface GoalCardProps {
  readonly goal: GoalDto;
  readonly funding: GoalFundingEntry | null;
  readonly compact?: boolean;
  readonly onOpen: (goal: GoalDto) => void;
}

export function GoalCard({
  goal,
  funding,
  compact = false,
  onOpen,
}: GoalCardProps) {
  const target = targetAmountAtomic(goal);
  const allocatedAssets = funding?.allocatedAssets ?? null;
  const progress = goalFundingPercent(allocatedAssets ?? 0n, target);
  const formattedTargetDate = targetDate(goal);

  if (compact) {
    return (
      <Card className="group overflow-hidden shadow-none transition-colors hover:border-primary/50">
        <CardContent className="p-5">
          <button
            type="button"
            className="w-full min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            onClick={() => onOpen(goal)}
          >
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                <Target className="size-4" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-label font-medium text-foreground">
                      {goal.name}
                    </h3>

                    <p className="mt-0.5 text-caption text-muted-foreground">
                      {formattedTargetDate
                        ? `Est. ${formattedTargetDate}`
                        : "No target date"}
                    </p>
                  </div>

                  <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2 sm:gap-4 text-caption">
              <span className="break-words font-semibold text-muted-foreground tabular-nums">
                {allocatedAssets === null
                  ? "Savings unavailable"
                  : `${formatUsdc(allocatedAssets)} USDC saved`}
              </span>

              <span className="text-foreground tabular-nums">
                of {targetAmount(goal)} USDC
              </span>
            </div>

            <Progress
              className="mt-2"
              value={progress.visualPercent}
              aria-label={`${progress.labelPercent}% of target`}
            />
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="group overflow-hidden shadow-none transition-colors hover:border-primary/50">
      <CardContent className="p-5">
        <button
          type="button"
          className="w-full min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          onClick={() => onOpen(goal)}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="truncate text-label font-semibold text-foreground">
                {goal.name}
              </h3>

              <p className="mt-1 text-caption text-muted-foreground">
                {formattedTargetDate
                  ? `Target ${formattedTargetDate}`
                  : "No target date"}
              </p>
            </div>

            <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>

          <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2 sm:gap-4">
            <p className="min-w-0 break-words text-body font-semibold tabular-nums">
              {allocatedAssets === null
                ? "—"
                : `${formatUsdc(allocatedAssets)} USDC`}
            </p>

            <p className="break-words text-caption text-muted-foreground tabular-nums">
              of {targetAmount(goal)} USDC
            </p>
          </div>

          <div className="mt-3 space-y-2">
            <Progress
              value={progress.visualPercent}
              aria-label={`${progress.labelPercent}% of target`}
            />

            <div className="flex items-center justify-between gap-4 text-caption">
              <span className="font-medium text-foreground tabular-nums">
                {allocatedAssets === null
                  ? "Savings unavailable"
                  : `${progress.labelPercent}%`}
              </span>

              <span className="text-muted-foreground">
                saved
              </span>
            </div>
          </div>
        </button>

        <Button
          variant="ghost"
          size="sm"
          className="mt-3 -ml-3"
          onClick={() => onOpen(goal)}
        >
          View goal
        </Button>
      </CardContent>
    </Card>
  );
}
