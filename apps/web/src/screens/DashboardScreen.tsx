import { useState } from "react";

import { AccountModal } from "../features/dashboard/AccountModal.js";
import { DepositModal } from "../features/dashboard/DepositModal.js";
import { formatAccount, formatUsdc } from "../features/dashboard/formatters.js";
import type { DashboardPositionState } from "../features/dashboard/types.js";
import { WithdrawalModal } from "../features/dashboard/WithdrawalModal.js";

export type { DashboardPositionState } from "../features/dashboard/types.js";

interface DashboardScreenProps {
  readonly fundingOpen: boolean;
  readonly accountOpen: boolean;
  readonly walletAddress: string | null;
  readonly positionState: DashboardPositionState;
  readonly depositAmount: string;
  readonly depositStatus: string | null;
  readonly depositError: string | null;
  readonly withdrawAmount: string;
  readonly withdrawStatus: string | null;
  readonly withdrawError: string | null;
  readonly onAddMoney: () => void;
  readonly onCloseFunding: () => void;
  readonly onCloseAccount: () => void;
  readonly onSignOut: () => void;
  readonly onDepositAmountChange: (value: string) => void;
  readonly onSubmitDeposit: () => void;
  readonly onWithdrawAmountChange: (value: string) => void;
  readonly onSubmitWithdrawal: () => void;
  readonly onRefreshPosition: () => void;
}

export function DashboardScreen({
  fundingOpen,
  accountOpen,
  walletAddress,
  positionState,
  depositAmount,
  depositStatus,
  depositError,
  withdrawAmount,
  withdrawStatus,
  withdrawError,
  onAddMoney,
  onCloseFunding,
  onCloseAccount,
  onSignOut,
  onDepositAmountChange,
  onSubmitDeposit,
  onWithdrawAmountChange,
  onSubmitWithdrawal,
  onRefreshPosition,
}: DashboardScreenProps) {
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  return (
    <div className="dashboard">
      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">Kept Savings</p>
          <h1>Your USDC savings</h1>
          <p className="dashboard-hero__description">
            One USDC savings vault on Monad, with Aave providing the
            underlying variable yield.
          </p>
        </div>

        <button
          className="button button--primary"
          type="button"
          onClick={onAddMoney}
        >
          Add money
        </button>
      </section>

      <section className="dashboard-summary" aria-label="Savings vault overview">
        <div className="summary-card">
          <span className="summary-card__label">Savings vault</span>
          <strong className="summary-card__value">USDC</strong>
        </div>

        <div className="summary-card">
          <span className="summary-card__label">Underlying strategy</span>
          <strong className="summary-card__value">Aave on Monad</strong>
        </div>

        <div className="summary-card">
          <span className="summary-card__label">Your account</span>
          <strong className="summary-card__value summary-card__value--account">
            {walletAddress ? formatAccount(walletAddress) : "Account setup needed"}
          </strong>
          <span className="status-pill">
            {walletAddress ? "Account ready" : "Set up your account"}
          </span>
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="vault-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Your position</p>
            <h2 id="vault-heading">Savings vault</h2>
          </div>
        </div>

        <div className="empty-state">
          <div>
            {positionState.kind === "ready" ? (
              <>
                <h3>{formatUsdc(positionState.position.assets)} USDC saved</h3>
                <p>
                  {formatUsdc(positionState.position.usdcBalance)} USDC is available to add from your local test wallet.
                </p>
                {positionState.position.assets > 0n && (
                  <button className="button button--quiet" type="button" onClick={() => setWithdrawalOpen(true)}>
                    Withdraw
                  </button>
                )}
              </>
            ) : positionState.kind === "loading" ? (
              <p aria-live="polite">Checking your confirmed vault position…</p>
            ) : positionState.kind === "error" ? (
              <>
                <h3>We could not load your vault position.</h3>
                <p>{positionState.message}</p>
                <button className="button button--quiet" type="button" onClick={onRefreshPosition}>
                  Try again
                </button>
              </>
            ) : (
              <>
                <h3>Start building your savings.</h3>
                <p>
                  {walletAddress
                    ? "Your local vault account is being prepared."
                    : "Sign in to set up your account."}
                </p>
              </>
            )}
          </div>


        </div>
      </section>

      {fundingOpen && (
        <DepositModal
          amount={depositAmount}
          error={depositError}
          isReady={positionState.kind === "ready"}
          status={depositStatus}
          walletAddress={walletAddress}
          onAmountChange={onDepositAmountChange}
          onClose={onCloseFunding}
          onSubmit={onSubmitDeposit}
        />
      )}

      {withdrawalOpen && positionState.kind === "ready" && (
        <WithdrawalModal
          amount={withdrawAmount}
          error={withdrawError}
          position={positionState.position}
          status={withdrawStatus}
          onAmountChange={onWithdrawAmountChange}
          onClose={() => setWithdrawalOpen(false)}
          onSubmit={onSubmitWithdrawal}
        />
      )}

      {accountOpen && walletAddress && (
        <AccountModal
          positionState={positionState}
          walletAddress={walletAddress}
          onClose={onCloseAccount}
          onSignOut={onSignOut}
        />
      )}
    </div>
  );
}