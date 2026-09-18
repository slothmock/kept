import type { CommitmentDto } from "../../api/kept-api.js";

import {
  commitmentStatus,
  commitmentTitle,
} from "../../commitment-display.js";

interface CommitmentRowProps {
  readonly commitment: CommitmentDto;
  readonly goalName?: string;
  readonly compact?: boolean;
}

export function CommitmentRow({
  commitment,
  goalName,
  compact = false,
}: CommitmentRowProps) {
  return (
    <article
      className={
        compact
          ? "commitment-row commitment-row--compact"
          : "commitment-row"
      }
    >
      <div>
        {goalName && (
          <span className="goal-card__label">
            {goalName}
          </span>
        )}

        {compact ? (
          <>
            <strong>{commitmentTitle(commitment)}</strong>
            <span>
              {new Date(
                commitment.epochEnd,
              ).toLocaleDateString()}
            </span>
          </>
        ) : (
          <h3>{commitmentTitle(commitment)}</h3>
        )}
      </div>

      <span className="status-pill">
        {commitmentStatus(commitment.state)}
      </span>
    </article>
  );
}