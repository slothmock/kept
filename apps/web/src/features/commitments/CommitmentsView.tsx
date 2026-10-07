import { Plus } from "lucide-react";

import type { CommitmentDto, GoalDto } from "@/api/kept-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CommitmentCard } from "@/features/commitments/components/CommitmentCard";
import { commitmentStatus } from "@/features/commitments/display";

interface CommitmentsViewProps {
  readonly commitments: readonly CommitmentDto[];
  readonly goals: readonly GoalDto[];
  readonly onAddCommitment: (goal: GoalDto) => void;
  readonly onOpenGoal: (goal: GoalDto) => void;
  readonly onOpenCommitment: (commitment: CommitmentDto) => void;
}

function goalForCommitment(
  commitment: CommitmentDto,
  goals: readonly GoalDto[],
): GoalDto | null {
  return goals.find((goal) => goal.id === commitment.savingsGoalId) ?? null;
}

export function CommitmentsView({
  commitments,
  goals,
  onAddCommitment,
  onOpenGoal,
  onOpenCommitment,
}: CommitmentsViewProps) {
  const active = commitments.filter(
    (commitment) => commitment.state === "ACTIVE",
  );

  const verified = commitments.filter(
    (commitment) => commitment.state === "COMPLETED",
  );

  const inactive = commitments.filter(
    (commitment) =>
      commitment.state === "FAILED"
      || commitment.state === "CANCELLED",
  );

  const draft = commitments.filter(
    (commitment) => commitment.state === "DRAFT",
  );

  const activeGoals = goals.filter((goal) => goal.status === "ACTIVE");

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-caption font-medium text-primary">
            Commitments
          </p>

          <h1 className="mt-2 text-h1 font-semibold tracking-tight">
            Keep your promises to yourself.
          </h1>

          <p className="mt-2 max-w-2xl text-body text-muted-foreground">
            Commitments turn your goals into simple, repeatable actions.
          </p>
        </div>

        {activeGoals.length > 0 ? (
          <Button
            onClick={() => onAddCommitment(activeGoals[0]!)}
          >
            <Plus className="size-4" />
            Add commitment
          </Button>
        ) : null}
      </section>

      <section
        className="grid gap-4 sm:grid-cols-3"
        aria-label="Commitments summary"
      >
        <Card className="shadow-none">
          <CardContent className="p-5">
            <p className="text-caption text-muted-foreground">
              In progress
            </p>
            <p className="mt-2 text-h3 font-semibold tabular-nums">
              {active.length}
            </p>
            <p className="mt-1 text-caption text-muted-foreground">
              Active commitments
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardContent className="p-5">
            <p className="text-caption text-muted-foreground">
              Verified
            </p>
            <p className="mt-2 text-h3 font-semibold tabular-nums">
              {verified.length}
            </p>
            <p className="mt-1 text-caption text-muted-foreground">
              Successfully completed
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardContent className="p-5">
            <p className="text-caption text-muted-foreground">
              Not completed
            </p>
            <p className="mt-2 text-h3 font-semibold tabular-nums">
              {inactive.length}
            </p>
            <p className="mt-1 text-caption text-muted-foreground">
              Failed or cancelled
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4" aria-labelledby="active-commitments-heading">
        <div>
          <h2
            id="active-commitments-heading"
            className="text-h2 font-semibold tracking-tight"
          >
            Current commitments
          </h2>

          <p className="mt-1 text-caption text-muted-foreground">
            The commitments that need your attention now.
          </p>
        </div>

        {active.length > 0 || draft.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {[...active, ...draft].map((commitment) => {
              const goal = goalForCommitment(commitment, goals);

              return (
                <Card key={commitment.id} className="shadow-none">
                  <CardContent className="space-y-4 p-5">
                    <CommitmentCard commitment={commitment} />

                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-caption text-muted-foreground">
                          Goal
                        </p>
                        <p className="mt-1 truncate text-label font-medium">
                          {goal?.name ?? "Goal unavailable"}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onOpenCommitment(commitment)}
                        >
                          View commitment
                        </Button>

                        {goal ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onOpenGoal(goal)}
                          >
                            View goal
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border-dashed shadow-none">
            <CardContent className="p-6">
              <p className="text-label font-medium">
                No active commitments
              </p>

              <p className="mt-2 max-w-xl text-caption text-muted-foreground">
                Add a commitment to one of your goals when you are ready to build a regular saving habit.
              </p>
            </CardContent>
          </Card>
        )}
      </section>

      {verified.length > 0 || inactive.length > 0 ? (
        <section className="space-y-4" aria-labelledby="commitment-history-heading">
          <div>
            <h2
              id="commitment-history-heading"
              className="text-h2 font-semibold tracking-tight"
            >
              Past commitments
            </h2>

            <p className="mt-1 text-caption text-muted-foreground">
              A record of commitments that have finished.
            </p>
          </div>

          <Card className="overflow-hidden shadow-none">
            <CardContent className="divide-y divide-border p-0">
              {[...verified, ...inactive].map((commitment) => {
                const goal = goalForCommitment(commitment, goals);

                return (
                  <button
                    key={commitment.id}
                    type="button"
                    onClick={() => onOpenCommitment(commitment)}
                    className="flex w-full flex-col gap-3 px-5 py-4 text-left transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-label font-medium">
                        {goal?.name ?? "Goal unavailable"}
                      </p>
                      <p className="mt-1 text-caption text-muted-foreground">
                        Ended {new Date(commitment.epochEnd).toLocaleDateString()}
                      </p>
                    </div>

                    <Badge
                      variant={
                        commitment.state === "COMPLETED"
                          ? "success"
                          : "muted"
                      }
                    >
                      {commitmentStatus(commitment.state)}
                    </Badge>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
