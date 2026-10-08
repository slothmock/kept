import { useState } from "react";
import {
  ArrowLeft,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  Info,
  Target,
  Trash2,
} from "lucide-react";

import type {
  CommitmentDto,
  GoalDto,
} from "@/api/kept-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { commitmentStatus, commitmentTitle } from "@/features/commitments/display";
import type { RewardState } from "@/features/commitments/reward-claim";
import { formatUsdc } from "@/features/savings/format";

interface CommitmentDetailViewProps {
  readonly commitment: CommitmentDto;
  readonly goal: GoalDto | null;
  readonly rewardState: RewardState | undefined;
  readonly claiming: boolean;
  readonly claimError: string | null;
  readonly onBack: () => void;
  readonly onOpenGoal: (goal: GoalDto) => void;
  readonly onClaimReward: (commitment: CommitmentDto) => Promise<boolean>;
  readonly cancelling: boolean;
  readonly cancelStatus: string | null;
  readonly cancelError: string | null;
  readonly onCancel: (commitment: CommitmentDto) => Promise<boolean>;
  readonly onDismissCancel: () => void;
  readonly onAddToSavings: () => void;
}

function goalTargetAmount(goal: GoalDto): string {
  try {
    return formatUsdc(BigInt(goal.targetAmountAtomic));
  } catch {
    return "—";
  }
}

function formatDate(value: string): string {
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

function formatShortDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(date);
}

function badgeVariant(
  state: CommitmentDto["state"],
): "success" | "destructive" | "muted" | "secondary" {
  if (state === "COMPLETED") {
    return "success";
  }

  if (state === "FAILED") {
    return "destructive";
  }

  if (state === "CANCELLED") {
    return "muted";
  }

  return "secondary";
}

function commitmentProgress(
  commitment: CommitmentDto,
): number {
  if (commitment.state === "COMPLETED") {
    return 100;
  }

  if (
    commitment.state === "FAILED"
    || commitment.state === "CANCELLED"
  ) {
    return 0;
  }

  const start = new Date(commitment.epochStart).getTime();
  const end = new Date(commitment.epochEnd).getTime();
  const now = Date.now();

  if (
    !Number.isFinite(start)
    || !Number.isFinite(end)
    || end <= start
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (now - start) / (end - start) * 100,
      ),
    ),
  );
}

export function CommitmentDetailView({
  commitment,
  goal,
  rewardState,
  claiming,
  claimError,
  onBack,
  onOpenGoal,
  onClaimReward,
  cancelling,
  cancelStatus,
  cancelError,
  onCancel,
  onDismissCancel,
  onAddToSavings,
}: CommitmentDetailViewProps) {
  const [cancelDialogOpen, setCancelDialogOpen] =
    useState(false);
  const reward =
    rewardState?.kind === "ready"
      ? rewardState.reward
      : null;

  const progress =
    commitmentProgress(commitment);

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
          Back to Commitments
        </Button>

        <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-caption font-medium text-muted-foreground">
              Commitment
            </p>

            <h1 className="mt-1 text-h1 font-semibold tracking-tight">
              {commitmentTitle(commitment)}
            </h1>

            {goal ? (
              <button
                type="button"
                className="mt-2 text-body text-muted-foreground hover:text-foreground hover:underline"
                onClick={() => onOpenGoal(goal)}
              >
                For {goal.name}
              </button>
            ) : null}
          </div>

          <Badge variant={badgeVariant(commitment.state)}>
            {commitmentStatus(commitment.state)}
          </Badge>
        </div>
      </div>

      <Card className="shadow-none">
        <CardContent className="p-6 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
            <div>
              <p className="text-caption text-muted-foreground">
                Commitment progress
              </p>

              <p className="mt-2 text-h2 font-semibold tabular-nums">
                {progress}%
              </p>

              <div className="mt-4 h-2 overflow-hidden rounded-full bg-disabled">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${progress}%` }}
                  aria-hidden="true"
                />
              </div>

              <p className="mt-3 text-caption text-muted-foreground">
                Runs from {formatShortDate(commitment.epochStart)} to {formatShortDate(commitment.epochEnd)}.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-6">
              <SummaryItem
                label="Started"
                value={formatShortDate(commitment.epochStart)}
              />

              <SummaryItem
                label="Ends"
                value={formatShortDate(commitment.epochEnd)}
              />

              <SummaryItem
                label="Verification by"
                value={formatShortDate(commitment.verificationDeadline)}
              />

              <SummaryItem
                label="State"
                value={commitmentStatus(commitment.state)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.75fr)]">
        <section className="space-y-4">
          <div>
            <h2 className="text-h3 font-semibold tracking-tight">
              Verification timeline
            </h2>

            <p className="mt-1 text-caption text-muted-foreground">
              The real milestones Kept uses for this commitment.
            </p>
          </div>

          <Card className="shadow-none">
            <CardContent className="p-5">
              <TimelineItem
                icon={CalendarCheck2}
                title="Commitment started"
                detail={formatDate(commitment.epochStart)}
                complete
              />

              <TimelineItem
                icon={Clock3}
                title="Commitment period ends"
                detail={formatDate(commitment.epochEnd)}
                complete={
                  commitment.state === "COMPLETED"
                  || commitment.state === "FAILED"
                  || commitment.state === "CANCELLED"
                }
              />

              <TimelineItem
                icon={CheckCircle2}
                title="Verification deadline"
                detail={formatDate(commitment.verificationDeadline)}
                complete={
                  commitment.state === "COMPLETED"
                  || commitment.state === "FAILED"
                }
                last
              />
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                  <Info className="size-4" />
                </div>

                <div>
                  <h2 className="text-label font-semibold">
                    How verification works
                  </h2>

                  <p className="mt-2 text-caption text-muted-foreground">
                    Kept checks whether the commitment&apos;s defined condition was met within the commitment window. Once verification finishes, the commitment is marked verified or not completed. Eligible verified commitments can then expose a claimable reward.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-4">
          <Card className="shadow-none">
            <CardContent className="p-5">
              <p className="text-caption text-muted-foreground">
                Reward
              </p>

              {rewardState?.kind === "loading" ? (
                <p className="mt-2 text-label font-medium text-muted-foreground">
                  Checking reward…
                </p>
              ) : !rewardState ? (
                <>
                  <p className="mt-2 text-h3 font-semibold">
                    —
                  </p>

                  <p className="mt-1 text-caption text-muted-foreground">
                    {commitment.state === "COMPLETED"
                      ? "Reward details are unavailable for this commitment."
                      : "Reward details become available after verification."}
                  </p>
                </>
              ) : rewardState.kind === "error" ? (
                <p className="mt-2 text-caption text-muted-foreground">
                  {rewardState.message}
                </p>
              ) : reward && reward.rewardClaimed ? (
                <>
                  <p className="mt-2 text-h3 font-semibold text-success tabular-nums">
                    {formatUsdc(reward.rewardAssets)} USDC
                  </p>

                  <p className="mt-1 text-caption text-muted-foreground">
                    Reward claimed and added to available cash.
                  </p>

                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={onAddToSavings}
                  >
                    Add to savings
                  </Button>
                </>
              ) : reward && reward.rewardAssets > 0n ? (
                <>
                  <p className="mt-2 text-h3 font-semibold text-success tabular-nums">
                    {formatUsdc(reward.rewardAssets)} USDC
                  </p>

                  <p className="mt-1 text-caption text-muted-foreground">
                    Available after successful verification.
                  </p>

                  <Button
                    size="sm"
                    className="mt-4"
                    disabled={claiming}
                    onClick={() => {
                      void onClaimReward(commitment);
                    }}
                  >
                    {claiming ? "Claiming…" : "Claim reward"}
                  </Button>
                </>
              ) : (
                <>
                  <p className="mt-2 text-h3 font-semibold">
                    —
                  </p>

                  <p className="mt-1 text-caption text-muted-foreground">
                    {commitment.state === "COMPLETED"
                      ? "Verified with no reward available."
                      : "Reward details become available after verification."}
                  </p>
                </>
              )}

              {claimError ? (
                <p
                  className="mt-3 text-caption text-destructive"
                  role="alert"
                >
                  {claimError}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                  <Target className="size-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-caption text-muted-foreground">
                    Linked goal
                  </p>

                  {goal ? (
                    <>
                      <p className="mt-1 truncate text-label font-semibold">
                        {goal.name}
                      </p>

                      <p className="mt-1 text-caption text-muted-foreground">
                        {goalTargetAmount(goal)} {goal.targetAsset} target
                      </p>

                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4"
                        onClick={() => onOpenGoal(goal)}
                      >
                        View goal
                      </Button>
                    </>
                  ) : (
                    <p className="mt-1 text-caption text-muted-foreground">
                      Goal unavailable.
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {commitment.state === "ACTIVE" ? (
            <div className="space-y-3">
              <Button
                type="button"
                variant="destructive"
                className="w-full"
                disabled={cancelling}
                onClick={() => {
                  onDismissCancel();
                  setCancelDialogOpen(true);
                }}
              >
                <Trash2 className="size-4" />
                {cancelling ? "Cancelling…" : "Cancel commitment"}
              </Button>

              {cancelStatus ? (
                <p
                  className="text-caption text-muted-foreground"
                  role="status"
                >
                  {cancelStatus}
                </p>
              ) : null}

              {cancelError ? (
                <p
                  className="text-caption text-destructive"
                  role="alert"
                >
                  {cancelError}
                </p>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>

      <Dialog
        open={cancelDialogOpen}
        onOpenChange={(open) => {
          if (!cancelling) {
            setCancelDialogOpen(open);
          }

          if (!open) {
            onDismissCancel();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Cancel this commitment?
            </DialogTitle>

            <DialogDescription>
              This stops the current commitment. You can create another commitment of the same type for this goal afterwards.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={cancelling}
              onClick={() => setCancelDialogOpen(false)}
            >
              Keep commitment
            </Button>

            <Button
              type="button"
              variant="destructive"
              disabled={cancelling}
              onClick={() => {
                void (
                  async () => {
                    const succeeded =
                      await onCancel(commitment);

                    if (succeeded) {
                      setCancelDialogOpen(false);
                    }
                  }
                )();
              }}
            >
              {cancelling
                ? "Cancelling…"
                : "Cancel commitment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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

      <p className="mt-1 text-label font-semibold">
        {value}
      </p>
    </div>
  );
}

function TimelineItem({
  icon: Icon,
  title,
  detail,
  complete,
  last = false,
}: {
  readonly icon: typeof CalendarCheck2;
  readonly title: string;
  readonly detail: string;
  readonly complete: boolean;
  readonly last?: boolean;
}) {
  return (
    <div className="relative flex gap-4 pb-6 last:pb-0">
      {!last ? (
        <div className="absolute left-[17px] top-9 h-[calc(100%-1rem)] w-px bg-border" />
      ) : null}

      <div
        className={
          complete
            ? "relative z-10 grid size-9 shrink-0 place-items-center rounded-full bg-success-surface text-success"
            : "relative z-10 grid size-9 shrink-0 place-items-center rounded-full bg-disabled text-muted-foreground"
        }
      >
        <Icon className="size-4" />
      </div>

      <div className="pt-1">
        <p className="text-label font-medium">
          {title}
        </p>

        <p className="mt-1 text-caption text-muted-foreground">
          {detail}
        </p>
      </div>
    </div>
  );
}
