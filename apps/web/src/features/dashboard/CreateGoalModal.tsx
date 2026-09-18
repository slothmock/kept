import { useState } from "react";

import { ModalDialog } from "../../components/ModalDialog.js";

interface CreateGoalModalProps {
  readonly submitting: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onSubmit: (input: { readonly name: string; readonly targetAmount: string; readonly targetDate: string | null }) => Promise<boolean>;
}

export function CreateGoalModal({ submitting, error, onClose, onSubmit }: CreateGoalModalProps) {
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");

  return (
    <ModalDialog
      ariaLabel="Create a goal"
      backdropTestId="create-goal-modal-backdrop"
      className="flow-card"
      closeLabel="Close create goal"
      onClose={onClose}
    >
      <div className="modal-stack">
        <div>
          <p className="eyebrow">New goal</p>
          <h2>What are you working towards?</h2>
          <p className="modal-copy">Set the outcome. You can add a commitment to define how you plan to get there.</p>
        </div>
        <label className="field">
          Goal name
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Emergency fund" />
        </label>
        <label className="field">
          Target amount (USDC)
          <input inputMode="decimal" value={targetAmount} onChange={(event) => setTargetAmount(event.target.value)} placeholder="1000" />
        </label>
        <label className="field">
          Target date <span className="field-label__optional">optional</span>
          <input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="flow-actions">
          <button className="button button--quiet" type="button" onClick={onClose}>Cancel</button>
          <button className="button button--primary" type="button" disabled={submitting} onClick={() => { void onSubmit({ name, targetAmount, targetDate: targetDate || null }).then((created) => { if (created) onClose(); }); }}>
            {submitting ? "Creating…" : "Create goal"}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
