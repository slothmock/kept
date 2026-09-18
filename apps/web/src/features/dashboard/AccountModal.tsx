import { ModalDialog } from "../../components/ModalDialog.js";
import { formatUsdc } from "./formatters.js";
import type { DashboardPositionState } from "./types.js";

interface AccountModalProps {
  readonly onClose: () => void;
  readonly onSignOut: () => void;
  readonly positionState: DashboardPositionState;
  readonly walletAddress: string;
}

export function AccountModal({
  onClose,
  onSignOut,
  positionState,
  walletAddress,
}: AccountModalProps) {
  return (
    <ModalDialog ariaLabel="Your local test wallet" className="wallet-modal" closeLabel="Close account modal" onClose={onClose}>
      <p className="eyebrow">Local test wallet</p>
      <h2>Your local test wallet</h2>
      <p className="wallet-modal__address">{walletAddress}</p>
      {positionState.kind === "ready" && (
        <dl className="wallet-modal__balances">
          <div><dt>Available mock USDC</dt><dd>{formatUsdc(positionState.position.usdcBalance)} USDC</dd></div>
          <div><dt>Saved in Kept</dt><dd>{formatUsdc(positionState.position.assets)} USDC</dd></div>
        </dl>
      )}
      <p className="flow-card__intro">This account and its balances exist only on the local Anvil test network.</p>
      <button className="button button--quiet" type="button" onClick={onSignOut}>Sign out</button>
    </ModalDialog>
  );
}
