import type {
  CommitmentDto,
  GoalDto,
} from "../../api/kept-api.js";

import { CommitmentRow } from "./CommitmentRow.js";

interface CommitmentsSectionProps {
  readonly commitments: readonly CommitmentDto[];
  readonly goals: readonly GoalDto[];
}

export function CommitmentsSection({
  commitments,
  goals,
}: CommitmentsSectionProps) {
  return (
    <section
      className="dashboard-section"
      aria-labelledby="week-heading"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">This week</p>
          <h2 id="week-heading">Your commitments</h2>
        </div>
      </div>

      {commitments.length === 0 ? (
        <div className="empty-state">
          <div>
            <h3>No active commitments.</h3>

            <p>
              Open a goal and add one when you’re ready.
              Commitments never lock your savings.
            </p>
          </div>
        </div>
      ) : (
        <div className="commitment-list">
          {commitments.map((commitment) => {
            const goal = goals.find(
              (item) =>
                item.id === commitment.savingsGoalId,
            );

            return (
              <CommitmentRow
                key={commitment.id}
                commitment={commitment}
                goalName={goal?.name ?? "Goal"}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}