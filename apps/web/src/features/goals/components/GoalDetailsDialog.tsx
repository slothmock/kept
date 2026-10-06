import { useState } from "react";

import type { CommitmentDto, GoalDto } from "@/api/kept-api";

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
import { CommitmentCard } from "@/features/commitments/components/CommitmentCard";
import {
  goalFundingPercent,
  type GoalFundingEntry,
} from "@/features/goals/funding";
import { formatUsdc } from "@/features/savings/format";

import type { RewardState } from "@/features/commitments/reward-claim";

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

interface CommitmentRewardProps {
  readonly commitment: CommitmentDto;
  readonly rewardState: RewardState | undefined;
  readonly claiming: boolean;
  readonly rewardClaimError: {
    readonly commitmentId: string;
    readonly message: string;
  } | null;
  readonly onClaimReward: (commitment: CommitmentDto) => Promise<boolean>;
  readonly onAddToSavings: () => void;
}

function CommitmentReward({
  commitment,
  rewardState,
  claiming,
  rewardClaimError,
  onClaimReward,
  onAddToSavings,
}: CommitmentRewardProps) {
  if (commitment.state !== "COMPLETED") {
    return null;
  }

  if (!rewardState || rewardState.kind === "loading") {
    return (
      <div className="rounded-lg border bg-muted/20 px-4 py-3">
        <p className="text-sm text-muted-foreground">Checking reward…</p>
      </div>
    );
  }

  if (rewardState.kind === "error") {
    return (
      <div className="rounded-lg border bg-muted/20 px-4 py-3">
        <p className="text-sm text-muted-foreground">{rewardState.message}</p>
      </div>
    );
  }

  const { reward } = rewardState;

  if (reward.rewardClaimed) {
    return (
      <div className="rounded-lg border bg-muted/20 px-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Reward claimed</p>

            <p className="mt-1 text-sm text-muted-foreground">
              {formatUsdc(reward.rewardAssets)} USDC was added to your available
              cash.
            </p>
          </div>

          <Button size="sm" variant="outline" onClick={onAddToSavings}>
            Add to savings
          </Button>
        </div>
      </div>
    );
  }

  if (reward.rewardAssets <= 0n) {
    return (
      <div className="rounded-lg border bg-muted/20 px-4 py-3">
        <p className="text-sm text-muted-foreground">Verified</p>
      </div>
    );
  }

  const claimError =
    rewardClaimError?.commitmentId === commitment.id
      ? rewardClaimError.message
      : null;

  return (
    <div className="rounded-lg border bg-muted/20 px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">
            {formatUsdc(reward.rewardAssets)} USDC reward
          </p>

          <p className="mt-1 text-sm text-muted-foreground">
            Your commitment has been verified.
          </p>
        </div>

        <Button
          size="sm"
          disabled={claiming}
          onClick={() => void onClaimReward(commitment)}
        >
          {claiming ? "Claiming…" : "Claim reward"}
        </Button>
      </div>

      {claimError && (
        <p className="mt-3 text-sm text-destructive">{claimError}</p>
      )}
    </div>
  );
}

interface GoalDetailsDialogProps {
  readonly open: boolean;
  readonly goal: GoalDto | null;
  readonly deleting: boolean;
  readonly deleteStatus: string | null;
  readonly deleteError: string | null;
  readonly onDelete: (goal: GoalDto) => Promise<boolean>;
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
  readonly onClaimReward: (commitment: CommitmentDto) => Promise<boolean>;
  readonly onAddToSavings: () => void;
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
  onAddToSavings,
}: GoalDetailsDialogProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setConfirmDelete(false);
    }

    onOpenChange(nextOpen);
  };

  if (!goal) {
    return <Dialog open={open} onOpenChange={handleOpenChange} />;
  }

  const target = targetAmountAtomic(goal);

  const allocatedAssets = funding?.allocatedAssets ?? null;

  const progress = goalFundingPercent(allocatedAssets ?? 0n, target);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{goal.name}</DialogTitle>

          <DialogDescription>
            {goal.targetDate
              ? `Target date ${formatTargetDate(goal.targetDate)}`
              : "Keep building towards what matters."}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border bg-muted/20 p-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Saved</p>

              <div className="mt-1 flex items-baseline gap-2">
                <p className="text-3xl font-semibold tracking-tight tabular-nums">
                  {allocatedAssets === null ? "—" : formatUsdc(allocatedAssets)}
                </p>

                {allocatedAssets !== null && (
                  <span className="text-sm text-muted-foreground">USDC</span>
                )}
              </div>

              <p className="mt-1 text-sm text-muted-foreground">
                of {formatUsdc(target)} {goal.targetAsset} target
              </p>
            </div>

            <Button
              variant="outline"
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
              aria-label={`${progress.labelPercent}% of target`}
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
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-medium">Commitments</h3>

              <p className="mt-1 text-sm text-muted-foreground">
                Actions that help keep this goal moving.
              </p>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => onAddCommitment(goal)}
            >
              Add commitment
            </Button>
          </div>

          {commitments.length ? (
            <div className="space-y-4">
              {commitments.map((commitment) => (
                <div key={commitment.id} className="space-y-3">
                  <CommitmentCard commitment={commitment} />

                  <CommitmentReward
                    commitment={commitment}
                    rewardState={rewardStates[commitment.id]}
                    claiming={claimingRewardId === commitment.id}
                    rewardClaimError={rewardClaimError}
                    onClaimReward={onClaimReward}
                    onAddToSavings={() => {
                      handleOpenChange(false);
                      onAddToSavings();
                    }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-5">
              <p className="text-sm font-medium">No commitments yet</p>

              <p className="mt-1 text-sm text-muted-foreground">
                Add one when you're ready to build a regular action around this
                goal.
              </p>
            </div>
          )}
        </div>

        <Separator />

        <div>
          {!confirmDelete ? (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive hover:text-white"
                onClick={() => setConfirmDelete(true)}
              >
                Delete goal
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm font-medium">Delete “{goal.name}”?</p>

              <p className="mt-1 text-sm text-muted-foreground">
                The goal will be removed and its savings will become unassigned.
                Your money stays in Kept. Connected commitments will also be
                cancelled.
              </p>

              <div className="mt-4 flex gap-2">
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
                  onClick={async () => {
                    const deleted = await onDelete(goal);

                    if (deleted) {
                      setConfirmDelete(false);
                      handleOpenChange(false);
                    }
                  }}
                >
                  {deleting ? "Deleting…" : "Delete goal"}
                </Button>
              </div>

              {deleteStatus && (
                <p className="mt-3 text-sm text-muted-foreground">
                  {deleteStatus}
                </p>
              )}

              {deleteError && (
                <p className="mt-3 text-sm text-destructive">{deleteError}</p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
