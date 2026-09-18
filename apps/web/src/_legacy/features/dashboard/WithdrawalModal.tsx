import { ModalDialog } from "../../components/ModalDialog.js";
import type { VaultPosition } from "../../vault/position.js";
import { formatUsdc } from "../../formatters.js";

interface WithdrawalModalProps {
  readonly amount: string;
  readonly error: string | null;
  readonly onAmountChange: (value: string) => void;
  readonly onClose: () => void;
  readonly onSubmit: () => void;
  readonly position: VaultPosition;
  readonly status: string | null;
}

export function WithdrawalModal({
  amount,
  error,
  onAmountChange,
  onClose,
  onSubmit,
  position,
  status,
}: WithdrawalModalProps) {
  return (
    <ModalDialog ariaLabel="Withdraw test USDC" className="flow-card" closeLabel="Close withdrawal modal" onClose={onClose}>
      <p className="eyebrow">Withdraw</p>
      <h2>Move test USDC back to your wallet</h2>
      <p className="flow-card__intro">Your confirmed savings balance is {formatUsdc(position.assets)} USDC.</p>
      <label className="field" htmlFor="withdraw-amount">
        <span>Amount in USDC</span>
        <input
          id="withdraw-amount"
          inputMode="decimal"
          min="0"
          placeholder="0.00"
          step="0.000001"
          type="text"
          value={amount}
          onChange={(event) => onAmountChange(event.target.value)}
        />
      </label>
      {status && <p aria-live="polite" className="flow-card__status">{status}</p>}
      {error && <p role="alert" className="flow-card__error">{error}</p>}
      <div className="flow-actions">
        <button className="button button--primary" type="button" onClick={onSubmit}>Withdraw test USDC</button>
      </div>
    </ModalDialog>
  );
}
