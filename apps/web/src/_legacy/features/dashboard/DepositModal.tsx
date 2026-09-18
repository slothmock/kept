import { ModalDialog } from "../../components/ModalDialog.js";

interface DepositModalProps {
  readonly amount: string;
  readonly error: string | null;
  readonly isReady: boolean;
  readonly onAmountChange: (value: string) => void;
  readonly onClose: () => void;
  readonly onSubmit: () => void;
  readonly status: string | null;
  readonly walletAddress: string | null;
}

export function DepositModal({
  amount,
  error,
  isReady,
  onAmountChange,
  onClose,
  onSubmit,
  status,
  walletAddress,
}: DepositModalProps) {
  return (
    <ModalDialog
      ariaLabel="Add test USDC to your savings"
      backdropTestId="add-money-modal-backdrop"
      className="flow-card"
      closeLabel="Close add-money modal"
      onClose={onClose}
    >
      <p className="eyebrow">Local test mode</p>
      <h2>Add test USDC to your savings</h2>
      <p className="flow-card__intro">This sends mock USDC to the local test vault. It is not Monad, real USDC, Aave, or a production funding flow.</p>
      <label className="field" htmlFor="deposit-amount">
        <span>Amount in USDC</span>
        <input
          id="deposit-amount"
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
        <button className="button button--primary" disabled={!isReady || !walletAddress} type="button" onClick={onSubmit}>
          Deposit test USDC
        </button>
      </div>
    </ModalDialog>
  );
}
