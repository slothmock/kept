import type {
  CommitmentDto,
  GoalDto,
} from "../../api/kept-api.js";

import {
  commitmentStatus,
  commitmentTitle,
} from "../../commitment-display.js";

import { targetAmount } from "../../goal-display.js";

interface GoalCardProps {
  readonly goal: GoalDto;
  readonly currentCommitment?: CommitmentDto | undefined;
  readonly progress: number | null;
  readonly onSelect: (goalId: string) => void;
}

export function GoalCard({
  goal,
  currentCommitment,
  progress,
  onSelect,
}: GoalCardProps) {
  return (
    <button
      className="goal-card"
      type="button"
      aria-label={`Open goal ${goal.name}`}
      onClick={() => onSelect(goal.id)}
    >
      <div className="goal-card__top">
        <div>
          <span className="goal-card__label">Goal</span>
          <h3>{goal.name}</h3>
        </div>

        <span className="status-pill">
          {goal.status === "ACTIVE" ? "Active" : goal.status}
        </span>
      </div>

      <div>
        <div className="goal-card__amount">
          <strong>{targetAmount(goal)}</strong>
          <span>USDC target</span>
        </div>

        {progress !== null && (
          <div
            className="goal-progress"
            aria-label={`${progress}% of goal target`}
          >
            <div className="goal-progress__track">
              <span
                style={{
                  width: `${Math.min(progress, 100)}%`,
                }}
              />
            </div>

            <small>{progress.toFixed(0)}% funded</small>
          </div>
        )}
      </div>

      <div className="goal-card__footer">
        <span>
          {currentCommitment
            ? commitmentTitle(currentCommitment)
            : "No commitment yet"}
        </span>

        <span>
          {currentCommitment
            ? commitmentStatus(currentCommitment.state)
            : "Add one"}
        </span>
      </div>
    </button>
  );
}