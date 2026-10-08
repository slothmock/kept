import type { GoalDto } from "@/api/kept-api";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  goalFundingPercent,
  type GoalFundingEntry,
} from "@/features/goals/funding";
import { formatUsdc } from "@/features/savings/format";

function targetAmountAtomic(goal: GoalDto): bigint {
  try {
    return BigInt(goal.targetAmountAtomic);
  } catch {
    return 0n;
  }
}

function formatTargetDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function GoalDetailSummary({
  goal,
  funding,
  currentApyBps,
  activeCommitments,
}: {
  readonly goal: GoalDto;
  readonly funding: GoalFundingEntry | null;
  readonly currentApyBps: number | null;
  readonly activeCommitments: number;
}) {
  const target = targetAmountAtomic(goal);
  const allocatedAssets = funding?.allocatedAssets ?? null;
  const progress = goalFundingPercent(allocatedAssets ?? 0n, target);
  const remaining =
    allocatedAssets === null
      ? null
      : target > allocatedAssets
        ? target - allocatedAssets
        : 0n;

  return (
    <Card className="shadow-none">
      <CardContent className="p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
          <div>
            <p className="text-caption text-muted-foreground">
              Saved
            </p>

            <p className="mt-2 text-balance font-semibold tracking-tight tabular-nums">
              {allocatedAssets === null
                ? "—"
                : `${formatUsdc(allocatedAssets)} USDC`}
            </p>

            <p className="mt-2 text-caption text-muted-foreground">
              Target {formatUsdc(target)} {goal.targetAsset}
            </p>

            <div className="mt-6 space-y-2">
              <div className="flex items-center justify-between gap-4 text-caption">
                <span className="text-muted-foreground">
                  Progress
                </span>

                <span className="font-medium tabular-nums">
                  {allocatedAssets === null
                    ? "—"
                    : `${progress.labelPercent}%`}
                </span>
              </div>

              <Progress
                value={progress.visualPercent}
                aria-label={`${progress.labelPercent}% of target`}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-6">
            <SummaryItem
              label="Remaining"
              value={
                remaining === null
                  ? "—"
                  : `${formatUsdc(remaining)} USDC`
              }
            />

            <SummaryItem
              label="Target date"
              value={
                goal.targetDate
                  ? formatTargetDate(goal.targetDate)
                  : "Not set"
              }
            />

            <SummaryItem
              label="Current APY"
              value={
                currentApyBps === null
                  ? "—"
                  : `${(currentApyBps / 100).toFixed(2)}%`
              }
            />

            <SummaryItem
              label="Active commitments"
              value={String(activeCommitments)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryItem({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <p className="text-caption text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 text-label font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}
