import type { DashboardPositionState } from "../../types.js";
import { formatUsdc } from "../../formatters.js";

interface MoneySectionProps {
  readonly positionState: DashboardPositionState;
  readonly onAddMoney: () => void;
  readonly onWithdraw: () => void;
}

export function MoneySection({
  positionState,
  onAddMoney,
  onWithdraw,
}: MoneySectionProps) {
  const canWithdraw =
    positionState.kind === "ready" &&
    positionState.position.assets > 0n;

  return (
    <section
      className="dashboard-section"
      aria-labelledby="money-heading"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Your money</p>
          <h2 id="money-heading">
            Available whenever you need it
          </h2>
        </div>
      </div>

      <div className="money-panel">
        <div>
          <strong>
            {positionState.kind === "ready"
              ? `${formatUsdc(
                  positionState.position.assets,
                )} USDC`
              : "—"}
          </strong>

          <span>currently in Kept</span>
        </div>

        <div className="money-panel__actions">
          <button
            className="button button--secondary"
            type="button"
            onClick={onAddMoney}
          >
            Add money
          </button>

          <button
            className="button button--quiet"
            type="button"
            disabled={!canWithdraw}
            onClick={onWithdraw}
          >
            Withdraw
          </button>
        </div>
      </div>
    </section>
  );
}