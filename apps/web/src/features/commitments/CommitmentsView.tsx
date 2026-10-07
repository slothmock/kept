import { useState } from "react";
import {
  ArrowRight,
  Plus,
  Sparkles,
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
import { CommitmentCard } from "@/features/commitments/components/CommitmentCard";
import { commitmentStatus } from "@/features/commitments/display";

interface CommitmentsViewProps {
  readonly commitments: readonly CommitmentDto[];
  readonly goals: readonly GoalDto[];
  readonly onAddCommitment: (goal: GoalDto) => void;
  readonly onOpenGoal: (goal: GoalDto) => void;
  readonly onOpenCommitment: (commitment: CommitmentDto) => void;
}

type CommitmentFilter =
  | "active"
  | "completed";

function goalForCommitment(
  commitment: CommitmentDto,
  goals: readonly GoalDto[],
): GoalDto | null {
  return goals.find(
    (goal) => goal.id === commitment.savingsGoalId,
  ) ?? null;
}

export function CommitmentsView({
  commitments,
  goals,
  onAddCommitment,
  onOpenGoal,
  onOpenCommitment,
}: CommitmentsViewProps) {
  const [filter, setFilter] =
    useState<CommitmentFilter>("active");

  const active = commitments.filter(
    (commitment) => commitment.state === "ACTIVE",
  );

  const draft = commitments.filter(
    (commitment) => commitment.state === "DRAFT",
  );

  const completed = commitments.filter(
    (commitment) => commitment.state === "COMPLETED",
  );

  const failed = commitments.filter(
    (commitment) => commitment.state === "FAILED",
  );

  const cancelled = commitments.filter(
    (commitment) => commitment.state === "CANCELLED",
  );

  const activeGoals =
    goals.filter((goal) => goal.status === "ACTIVE");

  const finishedCount =
    completed.length + failed.length;

  const completionRate =
    finishedCount === 0
      ? null
      : Math.round(
        completed.length / finishedCount * 100,
      );

  const currentCommitments =
    [...active, ...draft];

  const completedCommitments =
    [...completed, ...failed, ...cancelled];

  const suggestedGoals =
    activeGoals.filter(
      (goal) =>
        !currentCommitments.some(
          (commitment) =>
            commitment.savingsGoalId === goal.id,
        ),
    );

  const visibleCommitments =
    filter === "active"
      ? currentCommitments
      : completedCommitments;

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-h1 font-semibold tracking-tight">
          Commitments
        </h1>

        {activeGoals.length > 0 ? (
          <Button
            onClick={() => onAddCommitment(activeGoals[0]!)}
          >
            <Plus className="size-4" />
            Add commitment
          </Button>
        ) : null}
      </section>

      <div
        className="inline-flex rounded-lg border border-border bg-surface p-1"
        role="group"
        aria-label="Commitment filters"
      >
        <button
          type="button"
          onClick={() => setFilter("active")}
          className={
            filter === "active"
              ? "rounded-md bg-accent px-4 py-2 text-label font-medium text-accent-foreground"
              : "rounded-md px-4 py-2 text-label text-muted-foreground transition-colors hover:text-foreground"
          }
        >
          Active
        </button>

        <button
          type="button"
          onClick={() => setFilter("completed")}
          className={
            filter === "completed"
              ? "rounded-md bg-accent px-4 py-2 text-label font-medium text-accent-foreground"
              : "rounded-md px-4 py-2 text-label text-muted-foreground transition-colors hover:text-foreground"
          }
        >
          Completed
        </button>
      </div>

      <section
        className="grid gap-4 sm:grid-cols-3"
        aria-label="Commitments summary"
      >
        <Card className="shadow-none">
          <CardContent className="p-6">
            <p className="text-caption font-medium text-muted-foreground">
              Completed
            </p>

            <p className="mt-2 text-h2 font-semibold tabular-nums">
              {completed.length}
            </p>

            <p className="mt-1 text-caption text-muted-foreground">
              Verified commitments
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardContent className="p-6">
            <p className="text-caption font-medium text-muted-foreground">
              Currently active
            </p>

            <p className="mt-2 text-h2 font-semibold tabular-nums">
              {active.length}
            </p>

            <p className="mt-1 text-caption text-muted-foreground">
              Commitments in progress
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardContent className="p-6">
            <p className="text-caption font-medium text-muted-foreground">
              Completion rate
            </p>

            <p className="mt-2 text-h2 font-semibold tabular-nums">
              {completionRate === null
                ? "—"
                : `${completionRate}%`}
            </p>

            <p className="mt-1 text-caption text-muted-foreground">
              Completed vs. failed
            </p>
          </CardContent>
        </Card>
      </section>

      <section
        className="space-y-4"
        aria-labelledby="commitment-list-heading"
      >
        <div>
          <h2
            id="commitment-list-heading"
            className="text-h3 font-semibold tracking-tight"
          >
            {filter === "active"
              ? "Active commitments"
              : "Completed commitments"}
          </h2>

          <p className="mt-1 text-caption text-muted-foreground">
            {filter === "active"
              ? "The commitments that need your attention now."
              : "Your finished and cancelled commitment history."}
          </p>
        </div>

        {visibleCommitments.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {visibleCommitments.map((commitment) => {
              const goal =
                goalForCommitment(commitment, goals);

              return (
                <Card
                  key={commitment.id}
                  className="group shadow-none transition-colors hover:border-primary/50"
                >
                  <CardContent className="p-5">
                    <CommitmentCard
                      commitment={commitment}
                      compact
                    />

                    <div className="mt-5 border-t border-border pt-4">
                      <div className="flex items-end justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-caption text-muted-foreground">
                            Goal
                          </p>

                          <button
                            type="button"
                            disabled={!goal}
                            className="mt-1 block max-w-full truncate text-left text-label font-medium hover:underline disabled:no-underline"
                            onClick={() => {
                              if (goal) {
                                onOpenGoal(goal);
                              }
                            }}
                          >
                            {goal?.name ?? "Goal unavailable"}
                          </button>
                        </div>

                        <div className="text-right">
                          <p className="text-caption text-muted-foreground">
                            {commitment.state === "ACTIVE"
                              || commitment.state === "DRAFT"
                              ? "Ends"
                              : "Ended"}
                          </p>

                          <p className="mt-1 text-label font-medium">
                            {new Date(
                              commitment.epochEnd,
                            ).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-4 w-full justify-between"
                        onClick={() =>
                          onOpenCommitment(commitment)
                        }
                      >
                        View commitment
                        <ArrowRight className="size-4" />
                      </Button>
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
                {filter === "active"
                  ? "No active commitments"
                  : "No completed commitments yet"}
              </p>

              <p className="mt-2 max-w-xl text-caption text-muted-foreground">
                {filter === "active"
                  ? "Add a commitment to one of your goals when you are ready to build a regular saving habit."
                  : "Finished commitments will appear here."}
              </p>
            </CardContent>
          </Card>
        )}
      </section>

      {filter === "active" && suggestedGoals.length > 0 ? (
        <section
          className="space-y-4"
          aria-labelledby="suggested-commitments-heading"
        >
          <div>
            <h2
              id="suggested-commitments-heading"
              className="text-h3 font-semibold tracking-tight"
            >
              Suggested
            </h2>

            <p className="mt-1 text-caption text-muted-foreground">
              Goals without an active commitment yet.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {suggestedGoals.slice(0, 2).map((goal) => (
              <Card
                key={goal.id}
                className="shadow-none"
              >
                <CardContent className="flex items-start gap-4 p-5">
                  <div className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                    <Sparkles className="size-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-label font-medium">
                      Add a commitment to {goal.name}
                    </p>

                    <p className="mt-1 text-caption text-muted-foreground">
                      Turn this goal into a regular action you can verify.
                    </p>

                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() =>
                        onAddCommitment(goal)
                      }
                    >
                      Add commitment
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {filter === "completed"
        && completedCommitments.length > 0 ? (
        <p className="text-caption text-muted-foreground">
          Statuses include{" "}
          <Badge variant="success">Verified</Badge>,{" "}
          <Badge variant="muted">Cancelled</Badge>, and{" "}
          <Badge variant="destructive">Not completed</Badge>.
        </p>
      ) : null}
    </div>
  );
}
