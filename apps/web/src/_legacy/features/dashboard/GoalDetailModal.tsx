import type {
  CommitmentDto,
  GoalDto,
} from "../../api/kept-api.js";

import { ModalDialog } from "../../components/ModalDialog.js";

import { CommitmentRow } from "./CommitmentRow.js";
import { targetAmount } from "../../goal-display.js";

interface GoalDetailModalProps {
  readonly goal: GoalDto;
  readonly commitments: readonly CommitmentDto[];
  readonly onClose: () => void;
  readonly onAddCommitment: (goalId: string) => void;
}

export function GoalDetailModal({
  goal,
  commitments,
  onClose,
  onAddCommitment,
}: GoalDetailModalProps) {
  return (
    <ModalDialog
      ariaLabel={`${goal.name} details`}
      className="flow-card goal-detail"
      closeLabel="Close goal details"
      onClose={onClose}
    >
      <div className="modal-stack">
        <div>
          <p className="eyebrow">Goal</p>

          <h2>{goal.name}</h2>

          <p className="modal-copy">
            Target: {targetAmount(goal)} {goal.targetAsset}
            {goal.targetDate
              ? ` by ${goal.targetDate}`
              : ""}
            .
          </p>
        </div>

        <div className="goal-detail__commitments">
          <div className="section-heading">
            <h3>Commitments</h3>

            <button
              className="button button--quiet"
              type="button"
              onClick={() => onAddCommitment(goal.id)}
            >
              + Add commitment
            </button>
          </div>

          {commitments.length === 0 ? (
            <p className="form-note">
              No commitment yet. Add one when you’re ready.
            </p>
          ) : (
            commitments.map((commitment) => (
              <CommitmentRow
                key={commitment.id}
                commitment={commitment}
                compact
              />
            ))
          )}
        </div>

        <p className="form-note">
          Savings are not locked to this goal. You can withdraw
          from Kept at any time.
        </p>
      </div>
    </ModalDialog>
  );
}