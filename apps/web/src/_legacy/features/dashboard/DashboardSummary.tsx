import type { DashboardPositionState } from "../../types.js";
import { formatUsdc } from "../../formatters.js";

interface DashboardSummaryProps {
  readonly positionState: DashboardPositionState;
  readonly loading: boolean;
  readonly activeGoalCount: number;
  readonly activeCommitmentCount: number;
}

export function DashboardSummary({
  positionState,
  loading,
  activeGoalCount,
  activeCommitmentCount,
}: DashboardSummaryProps) {
  return (
    <section className="dashboard-summary" aria-label="Kept overview">
      <div className="summary-card">
        <span className="summary-card__label">Total in Kept</span>

        <strong className="summary-card__value">
          {positionState.kind === "ready"
            ? `${formatUsdc(positionState.position.assets)} USDC`
            : "—"}
        </strong>

        <span className="summary-card__hint">
          Yield is reflected in this balance.
        </span>
      </div>

      <div className="summary-card">
        <span className="summary-card__label">Active goals</span>

        <strong className="summary-card__value">
          {loading ? "—" : activeGoalCount}
        </strong>

        <span className="summary-card__hint">
          Up to three on the free plan.
        </span>
      </div>

      <div className="summary-card">
        <span className="summary-card__label">This week</span>

        <strong className="summary-card__value">
          {loading ? "—" : activeCommitmentCount}
        </strong>

        <span className="summary-card__hint">
          Active or ready-to-start commitments.
        </span>
      </div>
    </section>
  );
}