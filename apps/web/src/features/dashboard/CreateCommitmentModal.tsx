import { useMemo, useState } from "react";

import type { GoalDto } from "../../api/kept-api.js";
import { ModalDialog } from "../../components/ModalDialog.js";

type CommitmentKind = "WEEKLY_SAVINGS_V1" | "ACTIVITY_COUNT_V1";

interface CreateCommitmentModalProps {
  readonly goal: GoalDto;
  readonly submitting: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onSubmit: (input: {
    readonly code: CommitmentKind;
    readonly target: string;
    readonly startAt: Date;
    readonly endAt: Date;
    readonly verificationDeadline: Date;
  }) => Promise<boolean>;
}

export function CreateCommitmentModal({ goal, submitting, error, onClose, onSubmit }: CreateCommitmentModalProps) {
  const [code, setCode] = useState<CommitmentKind>("WEEKLY_SAVINGS_V1");
  const [target, setTarget] = useState("50");
  const window = useMemo(() => {
    const startAt = new Date();
    startAt.setMilliseconds(0);
    const endAt = new Date(startAt.getTime() + 7 * 24 * 60 * 60 * 1_000);
    const verificationDeadline = new Date(endAt.getTime() + 24 * 60 * 60 * 1_000);
    return { startAt, endAt, verificationDeadline };
  }, []);

  const isSavings = code === "WEEKLY_SAVINGS_V1";

  return (
    <ModalDialog
      ariaLabel="Add a commitment"
      backdropTestId="create-commitment-modal-backdrop"
      className="flow-card"
      closeLabel="Close add commitment"
      onClose={onClose}
    >
      <div className="modal-stack">
        <div>
          <p className="eyebrow">{goal.name}</p>
          <h2>Add a commitment</h2>
          <p className="modal-copy">Goals say what you want to achieve. Commitments say what you’ll do this week.</p>
        </div>
        <div className="choice-stack" role="radiogroup" aria-label="Commitment type">
          <button className={`choice-card${isSavings ? " choice-card--selected" : ""}`} type="button" role="radio" aria-checked={isSavings} onClick={() => { setCode("WEEKLY_SAVINGS_V1"); setTarget("50"); }}>
            <strong>Save each week</strong>
            <span>Kept verifies your savings activity.</span>
          </button>
          <button className={`choice-card${!isSavings ? " choice-card--selected" : ""}`} type="button" role="radio" aria-checked={!isSavings} onClick={() => { setCode("ACTIVITY_COUNT_V1"); setTarget("3"); }}>
            <strong>Complete activities</strong>
            <span>An approved activity provider verifies the count.</span>
          </button>
        </div>
        <label className="field">
          {isSavings ? "Amount to save this week (USDC)" : "Activities to complete this week"}
          <input inputMode={isSavings ? "decimal" : "numeric"} value={target} onChange={(event) => setTarget(event.target.value)} />
        </label>
        <p className="form-note">Your money is never locked by a commitment. You can withdraw from Kept at any time.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="flow-actions">
          <button className="button button--quiet" type="button" onClick={onClose}>Cancel</button>
          <button className="button button--primary" type="button" disabled={submitting} onClick={() => { void onSubmit({ code, target, ...window }).then((created) => { if (created) onClose(); }); }}>
            {submitting ? "Adding…" : "Add commitment"}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
