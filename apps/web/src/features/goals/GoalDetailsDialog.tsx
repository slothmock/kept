import { useState } from "react";

import type {
  CommitmentDto,
  GoalDto,
} from "@/api/kept-api";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { CommitmentCard } from "@/features/commitments/CommitmentCard";
import {
  goalFundingPercent,
  type GoalFundingEntry,
} from "@/features/goals/funding";
import { formatUsdc } from "@/features/savings/format";

import type { RewardState } from "@/commitments/reward-claim";

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

interface GoalDetailsDialogProps {
  readonly open: boolean;
  readonly goal: GoalDto | null;
  readonly deleting: boolean;
  readonly deleteStatus: string | null;
  readonly deleteError: string | null;
  readonly onDelete: (
    goal: GoalDto,
  ) => Promise<boolean>;
  readonly funding: GoalFundingEntry | null;
  readonly commitments: readonly CommitmentDto[];
  readonly onOpenChange: (open: boolean) => void;
  readonly onManageSavings: (goal: GoalDto) => void;
  readonly onAddCommitment: (goal: GoalDto) => void;
  readonly rewardStates: Readonly<Record<string, RewardState>>;
  readonly claimingRewardId: string | null;
  readonly rewardClaimError: {
    readonly commitmentId: string;
    readonly message: string;
  } | null;
  readonly onClaimReward: (
    commitment: CommitmentDto,
  ) => Promise<boolean>;
}

export function GoalDetailsDialog({
  open,
  goal,
  deleting,
  deleteStatus,
  deleteError,
  onDelete,
  funding,
  commitments,
  onOpenChange,
  onManageSavings,
  onAddCommitment,
  rewardStates,
  claimingRewardId,
  rewardClaimError,
  onClaimReward,
}: GoalDetailsDialogProps) {
  const [confirmDelete, setConfirmDelete] =
    useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setConfirmDelete(false);
    }

    onOpenChange(nextOpen);
  };

  if (!goal) {
    return (
      <Dialog
        open={open}
        onOpenChange={handleOpenChange}
      />
    );
  }

  const target = targetAmountAtomic(goal);

  const allocatedAssets =
    funding?.allocatedAssets ?? null;

  const progress = goalFundingPercent(
    allocatedAssets ?? 0n,
    target,
  );

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {goal.name}
          </DialogTitle>

          <DialogDescription>
            {goal.targetDate
              ? `Target date ${formatTargetDate(
                goal.targetDate,
              )}`
              : "Keep building towards what matters."}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border bg-muted/20 p-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Saved towards this goal
              </p>

              <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
                {allocatedAssets === null
                  ? "—"
                  : `${formatUsdc(
                    allocatedAssets,
                  )} USDC`}
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                of {formatUsdc(target)}{" "}
                {goal.targetAsset}
              </p>
            </div>

            <Button
              disabled={!funding}
              onClick={() => {
                handleOpenChange(false);
                onManageSavings(goal);
              }}
            >
              Manage savings
            </Button>
          </div>

          <div className="mt-5 space-y-2">
            <Progress
              value={progress.visualPercent}
              aria-label={`${progress.labelPercent}% funded`}
            />

            <p className="text-sm font-medium tabular-nums">
              {allocatedAssets === null
                ? "Savings unavailable"
                : `${progress.labelPercent}% of target`}
            </p>
          </div>
        </div>

        <Separator />

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-medium">
                Commitments
              </h3>

              <p className="text-sm text-muted-foreground">
                Actions you have connected to this
                goal.
              </p>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                onAddCommitment(goal)
              }
            >
              Add commitment
            </Button>
          </div>

          {commitments.length ? (
            <div className="space-y-3">
              {commitments.map((commitment) => {
                const rewardState =
                  rewardStates[commitment.id];

                const claiming =
                  claimingRewardId === commitment.id;

                return (
                  <div
                    key={commitment.id}
                    className="space-y-2"
                  >
                    <CommitmentCard
                      commitment={commitment}
                    />

                    {commitment.state === "COMPLETED" && (
                      <div className="rounded-lg border bg-muted/20 px-4 py-3">
                        {!rewardState
                          || rewardState.kind === "loading" ? (
                          <p className="text-sm text-muted-foreground">
                            Checking reward…
                          </p>
                        ) : rewardState.kind === "error" ? (
                          <p className="text-sm text-muted-foreground">
                            {rewardState.message}
                          </p>
                        ) : rewardState.reward.rewardClaimed ? (
                          <div className="space-y-1">
                            <p className="text-sm font-medium">
                              Verified
                            </p>

                            <p className="text-sm text-muted-foreground">
                              {formatUsdc(
                                rewardState.reward.rewardAssets,
                              )}{" "}
                              USDC reward claimed
                            </p>
                          </div>
                        ) : rewardState.reward.rewardAssets > 0n ? (
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-medium">
                                Verified
                              </p>

                              <p className="text-sm text-muted-foreground">
                                {formatUsdc(
                                  rewardState.reward.rewardAssets,
                                )}{" "}
                                USDC reward available
                              </p>
                            </div>

                            <Button
                              size="sm"
                              disabled={claiming}
                              onClick={() =>
                                void onClaimReward(
                                  commitment,
                                )
                              }
                            >
                              {claiming
                                ? "Claiming…"
                                : "Claim reward"}
                            </Button>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Verified
                          </p>
                        )}

                        {claiming
                          && rewardClaimError && (
                            <p className="mt-2 text-sm text-destructive">
                              {rewardClaimError
                                && rewardState?.kind === "ready"
                                && !rewardState.reward.rewardClaimed
                                && (
                                  <p className="mt-2 text-sm text-destructive">
                                    {rewardClaimError?.commitmentId
                                      === commitment.id && (
                                        <p className="mt-2 text-sm text-destructive">
                                          {rewardClaimError.message}
                                        </p>
                                      )}
                                  </p>
                                )}
                            </p>
                          )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
              No commitments yet. Add one when
              you're ready to turn this goal into a
              regular action.
            </div>
          )}
        </div>

        <Separator />

        <div className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-sm font-medium">
              Delete goal
            </h3>

            <p className="text-sm text-muted-foreground">
              Savings assigned to this goal will stay
              in Kept and become available to assign
              elsewhere.
            </p>
          </div>

          {!confirmDelete ? (
            <Button
              variant="destructive"
              onClick={() =>
                setConfirmDelete(true)
              }
            >
              Delete goal
            </Button>
          ) : (
            <div className="space-y-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <div>
                <p className="text-sm font-medium">
                  Delete “{goal.name}”?
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                  This removes the goal from your
                  dashboard. Your savings remain in
                  Kept.<br />Any commitments
                  connected to this goal will also be
                  cancelled.
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={deleting}
                  onClick={() =>
                    setConfirmDelete(false)
                  }
                >
                  Cancel
                </Button>

                <Button
                  variant="destructive"
                  disabled={deleting}
                  onClick={async () => {
                    const deleted =
                      await onDelete(goal);

                    if (deleted) {
                      setConfirmDelete(false);
                      handleOpenChange(false);
                    }
                  }}
                >
                  {deleting
                    ? "Deleting…"
                    : "Delete goal"}
                </Button>
              </div>

              {deleteStatus && (
                <p className="text-sm text-muted-foreground">
                  {deleteStatus}
                </p>
              )}

              {deleteError && (
                <p className="text-sm text-destructive">
                  {deleteError}
                </p>
              )}
            </div>
          )}
        </div>

        <p className="text-xs leading-5 text-muted-foreground">
          Savings assigned to a goal remain part of
          your Kept balance and can be moved or
          withdrawn when needed.
        </p>
      </DialogContent>
    </Dialog>
  );
}