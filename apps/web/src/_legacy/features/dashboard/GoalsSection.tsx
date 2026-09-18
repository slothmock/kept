import type {
  CommitmentDto,
  GoalDto,
} from "../../api/kept-api.js";

import { GoalCard } from "./GoalCard.js";
import {
  getCurrentCommitment,
  getGoalCommitments,
} from "../../selectors.js";

interface GoalsSectionProps {
  readonly goals: readonly GoalDto[];
  readonly commitments: readonly CommitmentDto[];
  readonly loading: boolean;
  readonly singleGoalProgress: number | null;
  readonly onCreateGoal: () => void;
  readonly onSelectGoal: (goalId: string) => void;
}

export function GoalsSection({
  goals,
  commitments,
  loading,
  singleGoalProgress,
  onCreateGoal,
  onSelectGoal,
}: GoalsSectionProps) {
  return (
    <section
      className="dashboard-section"
      aria-labelledby="goals-heading"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Your goals</p>
          <h2 id="goals-heading">What you’re working towards</h2>
        </div>

        <button
          className="button button--quiet"
          type="button"
          onClick={onCreateGoal}
        >
          + New goal
        </button>
      </div>

      {loading ? (
        <div className="empty-state">
          <p aria-live="polite">Loading your goals…</p>
        </div>
      ) : goals.length === 0 ? (
        <div className="empty-state">
          <div>
            <h3>Create your first goal.</h3>

            <p>
              Start with the outcome you care about. Then add a weekly
              savings or activity commitment.
            </p>
          </div>

          <button
            className="button button--primary"
            type="button"
            onClick={onCreateGoal}
          >
            Create goal
          </button>
        </div>
      ) : (
        <div className="goal-grid">
          {goals.map((goal) => {
            const goalCommitments = getGoalCommitments(
              goal.id,
              commitments,
            );

            const currentCommitment =
              getCurrentCommitment(goalCommitments);

            return (
              <GoalCard
                key={goal.id}
                goal={goal}
                currentCommitment={currentCommitment}
                progress={
                  goals.length === 1
                    ? singleGoalProgress
                    : null
                }
                onSelect={onSelectGoal}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}