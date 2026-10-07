import { useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

import type { CommitmentDto, GoalDto } from "@/api/kept-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CommitmentCard } from "@/features/commitments/components/CommitmentCard";
import type { RewardState } from "@/features/commitments/reward-claim";
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

interface GoalDetailViewProps {
  readonly goal: GoalDto;
  readonly funding: GoalFundingEntry | null;
  readonly commitments: readonly CommitmentDto[];
  readonly deleting: boolean;
  readonly deleteStatus: string | null;
  readonly deleteError: string | null;
  readonly onDelete: (goal: GoalDto) => Promise<boolean>;
  readonly onBack: () => void;
  readonly onManageSavings: (goal: GoalDto) => void;
  readonly onAddCommitment: (goal: GoalDto) => void;
  readonly rewardStates: Readonly<Record<string, RewardState>>;
  readonly claimingRewardId: string | null;
  readonly rewardClaimError: {
    readonly commitmentId: string;
    readonly message: string;
  } | null;
  readonly onClaimReward: (commitment: CommitmentDto) => Promise<boolean>;
  readonly onAddToSavings: () => void;
}

export function GoalDetailView({
  goal,
  funding,
  commitments,
  deleting,
  deleteStatus,
  deleteError,
  onDelete,
  onBack,
  onManageSavings,
  onAddCommitment,
  rewardStates,
  claimingRewardId,
  rewardClaimError,
  onClaimReward,
  onAddToSavings,
}: GoalDetailViewProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const target = targetAmountAtomic(goal);
  const allocatedAssets = funding?.allocatedAssets ?? null;
  const progress = goalFundingPercent(allocatedAssets ?? 0n, target);

  return (
    <div className="space-y-8">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 text-muted-foreground"
          onClick={onBack}
        >
          <ArrowLeft className="size-4" />
          Goals
        </Button>

        <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-caption font-medium text-primary">Goal</p>
            <h1 className="mt-2 text-h1 font-semibold tracking-tight">
              {goal.name}
            </h1>
            <p className="mt-2 text-body text-muted-foreground">
              {goal.targetDate
                ? `Target date ${formatTargetDate(goal.targetDate)}`
                : "Keep building towards what matters."}
            </p>
          </div>

          <Button
            variant="outline"
            disabled={!funding}
            onClick={() => onManageSavings(goal)}
          >
            Manage savings
          </Button>
        </div>
      </div>

      <Card className="shadow-none">
        <CardContent className="p-6 sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
            <div>
              <p className="text-caption text-muted-foreground">
                Saved towards this goal
              </p>
              <p className="mt-2 text-balance font-semibold tracking-tight tabular-nums">
                {allocatedAssets === null
                  ? "—"
                  : `${formatUsdc(allocatedAssets)} USDC`}
              </p>
              <p className="mt-2 text-caption text-muted-foreground">
                of {formatUsdc(target)} {goal.targetAsset}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4 text-caption">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium tabular-nums">
                  {allocatedAssets === null ? "—" : `${progress.labelPercent}%`}
                </span>
              </div>
              <Progress
                value={progress.visualPercent}
                aria-label={`${progress.labelPercent}% of target`}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.7fr)]">
        <section className="space-y-4" aria-labelledby="goal-commitments-heading">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2
                id="goal-commitments-heading"
                className="text-h2 font-semibold tracking-tight"
              >
                Commitments
              </h2>
              <p className="mt-1 text-caption text-muted-foreground">
                Actions that keep this goal moving.
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onAddCommitment(goal)}
            >
              <Plus className="size-4" />
              Add commitment
            </Button>
          </div>

          {commitments.length > 0 ? (
            <div className="space-y-3">
              {commitments.map((commitment) => {
                const rewardState = rewardStates[commitment.id];
                const claimError =
                  rewardClaimError?.commitmentId === commitment.id
                    ? rewardClaimError.message
                    : null;

                return (
                  <Card key={commitment.id} className="shadow-none">
                    <CardContent className="space-y-4 p-4">
                      <CommitmentCard commitment={commitment} />

                      {commitment.state === "COMPLETED"
                        && rewardState?.kind === "ready"
                        && rewardState.reward.rewardAssets > 0n
                        && !rewardState.reward.rewardClaimed ? (
                        <div className="flex flex-col gap-3 rounded-md bg-success-surface p-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-label font-medium text-success">
                              {formatUsdc(rewardState.reward.rewardAssets)} USDC reward
                            </p>
                            <p className="mt-1 text-caption text-muted-foreground">
                              This commitment has been verified.
                            </p>
                          </div>
                          <Button
                            size="sm"
                            disabled={claimingRewardId === commitment.id}
                            onClick={() => {
                              void onClaimReward(commitment);
                            }}
                          >
                            {claimingRewardId === commitment.id
                              ? "Claiming…"
                              : "Claim reward"}
                          </Button>
                        </div>
                      ) : null}

                      {commitment.state === "COMPLETED"
                        && rewardState?.kind === "ready"
                        && rewardState.reward.rewardClaimed ? (
                        <div className="flex flex-col gap-3 rounded-md bg-success-surface p-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-label font-medium text-success">
                              Reward claimed
                            </p>
                            <p className="mt-1 text-caption text-muted-foreground">
                              {formatUsdc(rewardState.reward.rewardAssets)} USDC was added to available cash.
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={onAddToSavings}
                          >
                            Add to savings
                          </Button>
                        </div>
                      ) : null}

                      {claimError ? (
                        <p className="text-caption text-destructive" role="alert">
                          {claimError}
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="border-dashed shadow-none">
              <CardContent className="p-6">
                <p className="text-label font-medium">No commitments yet</p>
                <p className="mt-2 text-caption text-muted-foreground">
                  Add one when you&apos;re ready to build a regular action around this goal.
                </p>
              </CardContent>
            </Card>
          )}
        </section>

        <aside className="space-y-4">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Goal details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-caption text-muted-foreground">Target</p>
                <p className="mt-1 text-label font-medium tabular-nums">
                  {formatUsdc(target)} {goal.targetAsset}
                </p>
              </div>
              <div>
                <p className="text-caption text-muted-foreground">Target date</p>
                <p className="mt-1 text-label font-medium">
                  {goal.targetDate
                    ? formatTargetDate(goal.targetDate)
                    : "No target date"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/25 shadow-none">
            <CardHeader>
              <CardTitle className="text-destructive">Delete goal</CardTitle>
            </CardHeader>
            <CardContent>
              {!confirmDelete ? (
                <>
                  <p className="text-caption text-muted-foreground">
                    Deleting a goal keeps your money in Kept and returns its savings to the unassigned balance.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-4 text-destructive hover:bg-danger-surface hover:text-destructive"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="size-4" />
                    Delete goal
                  </Button>
                </>
              ) : (
                <div className="space-y-4">
                  <p className="text-caption text-muted-foreground">
                    Connected commitments will also be cancelled. This cannot be undone.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={deleting}
                      onClick={() => setConfirmDelete(false)}
                    >
                      Keep goal
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={deleting}
                      onClick={() => {
                        void (async () => {
                          const deleted = await onDelete(goal);
                          if (deleted) {
                            setConfirmDelete(false);
                            onBack();
                          }
                        })();
                      }}
                    >
                      {deleting ? "Deleting…" : "Delete goal"}
                    </Button>
                  </div>

                  {deleteStatus ? (
                    <p className="text-caption text-muted-foreground">
                      {deleteStatus}
                    </p>
                  ) : null}

                  {deleteError ? (
                    <p className="text-caption text-destructive" role="alert">
                      {deleteError}
                    </p>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
