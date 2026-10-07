import { ArrowLeft } from "lucide-react";

import type { CommitmentDto, GoalDto } from "@/api/kept-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  readonly onAddToSavings: () => void;
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

export function CommitmentDetailView({
  commitment,
  goal,
  rewardState,
  claiming,
  claimError,
  onBack,
  onOpenGoal,
  onClaimReward,
  onAddToSavings,
}: CommitmentDetailViewProps) {
  const reward =
    rewardState?.kind === "ready"
      ? rewardState.reward
      : null;

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
          Commitments
        </Button>

        <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-caption font-medium text-primary">
              Commitment
            </p>

            <h1 className="mt-2 text-h1 font-semibold tracking-tight">
              {commitmentTitle(commitment)}
            </h1>

            <p className="mt-2 max-w-2xl text-body text-muted-foreground">
              A simple action tied to one of your savings goals.
            </p>
          </div>

          <Badge variant={badgeVariant(commitment.state)}>
            {commitmentStatus(commitment.state)}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
        <section className="space-y-4">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Commitment details</CardTitle>
            </CardHeader>

            <CardContent className="grid gap-5 sm:grid-cols-2">
              <div>
                <p className="text-caption text-muted-foreground">
                  Starts
                </p>
                <p className="mt-1 text-label font-medium">
                  {formatDate(commitment.epochStart)}
                </p>
              </div>

              <div>
                <p className="text-caption text-muted-foreground">
                  Ends
                </p>
                <p className="mt-1 text-label font-medium">
                  {formatDate(commitment.epochEnd)}
                </p>
              </div>

              <div>
                <p className="text-caption text-muted-foreground">
                  Verification deadline
                </p>
                <p className="mt-1 text-label font-medium">
                  {formatDate(commitment.verificationDeadline)}
                </p>
              </div>

              <div>
                <p className="text-caption text-muted-foreground">
                  Status
                </p>
                <p className="mt-1 text-label font-medium">
                  {commitmentStatus(commitment.state)}
                </p>
              </div>
            </CardContent>
          </Card>

          {commitment.state === "COMPLETED" ? (
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle>Reward</CardTitle>
              </CardHeader>

              <CardContent>
                {!rewardState || rewardState.kind === "loading" ? (
                  <p className="text-caption text-muted-foreground">
                    Checking reward…
                  </p>
                ) : rewardState.kind === "error" ? (
                  <p className="text-caption text-muted-foreground">
                    {rewardState.message}
                  </p>
                ) : reward && reward.rewardClaimed ? (
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-label font-medium text-success">
                        Reward claimed
                      </p>
                      <p className="mt-1 text-caption text-muted-foreground">
                        {formatUsdc(reward.rewardAssets)} USDC was added to your available cash.
                      </p>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onAddToSavings}
                    >
                      Add to savings
                    </Button>
                  </div>
                ) : reward && reward.rewardAssets > 0n ? (
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-label font-medium text-success">
                        {formatUsdc(reward.rewardAssets)} USDC available
                      </p>
                      <p className="mt-1 text-caption text-muted-foreground">
                        This commitment has been verified.
                      </p>
                    </div>

                    <Button
                      size="sm"
                      disabled={claiming}
                      onClick={() => {
                        void onClaimReward(commitment);
                      }}
                    >
                      {claiming ? "Claiming…" : "Claim reward"}
                    </Button>
                  </div>
                ) : (
                  <p className="text-caption text-muted-foreground">
                    Verified with no reward available.
                  </p>
                )}

                {claimError ? (
                  <p className="mt-3 text-caption text-destructive" role="alert">
                    {claimError}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </section>

        <aside className="space-y-4">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Goal</CardTitle>
            </CardHeader>

            <CardContent>
              {goal ? (
                <>
                  <p className="text-label font-medium">
                    {goal.name}
                  </p>

                  <p className="mt-1 text-caption text-muted-foreground">
                    {formatUsdc(BigInt(goal.targetAmountAtomic))} {goal.targetAsset} target
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
                <p className="text-caption text-muted-foreground">
                  Goal unavailable.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Definition</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <div>
                <p className="text-caption text-muted-foreground">
                  Type
                </p>
                <p className="mt-1 text-label font-medium">
                  {commitment.definition.code}
                </p>
              </div>

              <div>
                <p className="text-caption text-muted-foreground">
                  Version
                </p>
                <p className="mt-1 text-label font-medium tabular-nums">
                  {commitment.definition.version}
                </p>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
