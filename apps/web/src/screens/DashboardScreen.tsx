import { useMemo, useState } from "react";

import type { CommitmentDto, GoalDto } from "../api/kept-api.js";
import { AccountModal } from "../features/dashboard/AccountModal.js";
import { CreateCommitmentModal } from "../features/dashboard/CreateCommitmentModal.js";
import { CreateGoalModal } from "../features/dashboard/CreateGoalModal.js";
import { DepositModal } from "../features/dashboard/DepositModal.js";
import { formatAccount, formatUsdc } from "../features/dashboard/formatters.js";
import type { DashboardPositionState } from "../features/dashboard/types.js";
import { WithdrawalModal } from "../features/dashboard/WithdrawalModal.js";
import { ModalDialog } from "../components/ModalDialog.js";

export type { DashboardPositionState } from "../features/dashboard/types.js";

export type ProductDataState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly goals: readonly GoalDto[]; readonly commitments: readonly CommitmentDto[] }
  | { readonly kind: "error"; readonly message: string; readonly goals: readonly GoalDto[]; readonly commitments: readonly CommitmentDto[] };

interface DashboardScreenProps {
  readonly fundingOpen: boolean;
  readonly accountOpen: boolean;
  readonly walletAddress: string | null;
  readonly positionState: DashboardPositionState;
  readonly productState: ProductDataState;
  readonly depositAmount: string;
  readonly depositStatus: string | null;
  readonly depositError: string | null;
  readonly withdrawAmount: string;
  readonly withdrawStatus: string | null;
  readonly withdrawError: string | null;
  readonly creatingGoal: boolean;
  readonly goalError: string | null;
  readonly creatingCommitment: boolean;
  readonly commitmentError: string | null;
  readonly onAddMoney: () => void;
  readonly onCloseFunding: () => void;
  readonly onCloseAccount: () => void;
  readonly onSignOut: () => void;
  readonly onDepositAmountChange: (value: string) => void;
  readonly onSubmitDeposit: () => void;
  readonly onWithdrawAmountChange: (value: string) => void;
  readonly onSubmitWithdrawal: () => void;
  readonly onRefreshPosition: () => void;
  readonly onRefreshProductData: () => void;
  readonly onCreateGoal: (input: { readonly name: string; readonly targetAmount: string; readonly targetDate: string | null }) => Promise<boolean>;
  readonly onCreateCommitment: (goal: GoalDto, input: {
    readonly code: "WEEKLY_SAVINGS_V1" | "ACTIVITY_COUNT_V1";
    readonly target: string;
    readonly startAt: Date;
    readonly endAt: Date;
    readonly verificationDeadline: Date;
  }) => Promise<boolean>;
}

function targetAmount(goal: GoalDto): string {
  try {
    return formatUsdc(BigInt(goal.targetAmountAtomic));
  } catch {
    return "—";
  }
}

function commitmentTitle(commitment: CommitmentDto): string {
  if (commitment.definition.code === "WEEKLY_SAVINGS_V1") {
    const amount = commitment.parameters.targetAmountAtomic;
    if (typeof amount === "string") {
      try {
        return `Save ${formatUsdc(BigInt(amount))} USDC this week`;
      } catch {
        return "Save this week";
      }
    }
    return "Save this week";
  }

  if (commitment.definition.code === "ACTIVITY_COUNT_V1") {
    const target = commitment.parameters.targetCount;
    return `Complete ${typeof target === "number" ? target : "your"} activities this week`;
  }

  return "Commitment";
}

function commitmentStatus(state: CommitmentDto["state"]): string {
  switch (state) {
    case "DRAFT": return "Ready to start";
    case "ACTIVE": return "In progress";
    case "COMPLETED": return "Verified";
    case "FAILED": return "Not completed";
    case "CANCELLED": return "Cancelled";
  }
}

export function DashboardScreen(props: DashboardScreenProps) {
  const {
    fundingOpen,
    accountOpen,
    walletAddress,
    positionState,
    productState,
    depositAmount,
    depositStatus,
    depositError,
    withdrawAmount,
    withdrawStatus,
    withdrawError,
    creatingGoal,
    goalError,
    creatingCommitment,
    commitmentError,
    onAddMoney,
    onCloseFunding,
    onCloseAccount,
    onSignOut,
    onDepositAmountChange,
    onSubmitDeposit,
    onWithdrawAmountChange,
    onSubmitWithdrawal,
    onRefreshPosition,
    onRefreshProductData,
    onCreateGoal,
    onCreateCommitment,
  } = props;

  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [createGoalOpen, setCreateGoalOpen] = useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [commitmentGoalId, setCommitmentGoalId] = useState<string | null>(null);

  const goals = productState.kind === "loading" ? [] : productState.goals;
  const commitments = productState.kind === "loading" ? [] : productState.commitments;
  const activeGoals = goals.filter((goal) => goal.status === "ACTIVE");
  const activeCommitments = commitments.filter((commitment) => commitment.state === "ACTIVE" || commitment.state === "DRAFT");
  const selectedGoal = selectedGoalId ? goals.find((goal) => goal.id === selectedGoalId) ?? null : null;
  const commitmentGoal = commitmentGoalId ? goals.find((goal) => goal.id === commitmentGoalId) ?? null : null;
  const selectedCommitments = selectedGoal ? commitments.filter((item) => item.savingsGoalId === selectedGoal.id) : [];
  const singleGoalProgress = useMemo(() => {
    if (activeGoals.length !== 1 || positionState.kind !== "ready") return null;
    const goal = activeGoals[0];
    if (!goal) return null;
    try {
      const target = BigInt(goal.targetAmountAtomic);
      if (target === 0n) return null;
      const current = positionState.position.assets > target ? target : positionState.position.assets;
      return Number((current * 10000n) / target) / 100;
    } catch {
      return null;
    }
  }, [activeGoals, positionState]);

  return (
    <div className="dashboard">
      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">Your Kept account</p>
          <h1>Keep moving towards what matters.</h1>
          <p className="dashboard-hero__description">
            Set goals, choose commitments, and keep your savings productive in the background. Your money remains withdrawable at any time.
          </p>
        </div>
        <div className="dashboard-hero__actions">
          <button className="button button--secondary" type="button" onClick={() => setCreateGoalOpen(true)}>New goal</button>
          <button className="button button--primary" type="button" onClick={onAddMoney}>Add money</button>
        </div>
      </section>

      <section className="dashboard-summary" aria-label="Kept overview">
        <div className="summary-card">
          <span className="summary-card__label">Total in Kept</span>
          <strong className="summary-card__value">
            {positionState.kind === "ready" ? `${formatUsdc(positionState.position.assets)} USDC` : "—"}
          </strong>
          <span className="summary-card__hint">Yield is reflected in this balance.</span>
        </div>
        <div className="summary-card">
          <span className="summary-card__label">Active goals</span>
          <strong className="summary-card__value">{productState.kind === "loading" ? "—" : activeGoals.length}</strong>
          <span className="summary-card__hint">Up to three on the free plan.</span>
        </div>
        <div className="summary-card">
          <span className="summary-card__label">This week</span>
          <strong className="summary-card__value">{productState.kind === "loading" ? "—" : activeCommitments.length}</strong>
          <span className="summary-card__hint">Active or ready-to-start commitments.</span>
        </div>
      </section>

      {productState.kind === "error" && (
        <div className="message message--error">
          <p>{productState.message}</p>
          <button className="button button--quiet" type="button" onClick={onRefreshProductData}>Try again</button>
        </div>
      )}

      <section className="dashboard-section" aria-labelledby="goals-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Your goals</p>
            <h2 id="goals-heading">What you’re working towards</h2>
          </div>
          <button className="button button--quiet" type="button" onClick={() => setCreateGoalOpen(true)}>+ New goal</button>
        </div>

        {productState.kind === "loading" ? (
          <div className="empty-state"><p aria-live="polite">Loading your goals…</p></div>
        ) : activeGoals.length === 0 ? (
          <div className="empty-state">
            <div>
              <h3>Create your first goal.</h3>
              <p>Start with the outcome you care about. Then add a weekly savings or activity commitment.</p>
            </div>
            <button className="button button--primary" type="button" onClick={() => setCreateGoalOpen(true)}>Create goal</button>
          </div>
        ) : (
          <div className="goal-grid">
            {activeGoals.map((goal) => {
              const goalCommitments = commitments.filter((item) => item.savingsGoalId === goal.id);
              const currentCommitment = goalCommitments.find((item) => item.state === "ACTIVE") ?? goalCommitments.find((item) => item.state === "DRAFT") ?? goalCommitments[0];
              return (
                <button className="goal-card" key={goal.id} type="button" onClick={() => setSelectedGoalId(goal.id)}>
                  <div className="goal-card__top">
                    <div>
                      <span className="goal-card__label">Goal</span>
                      <h3>{goal.name}</h3>
                    </div>
                    <span className="status-pill">{goal.status === "ACTIVE" ? "Active" : goal.status}</span>
                  </div>
                  <div>
                    <div className="goal-card__amount"><strong>{targetAmount(goal)}</strong><span>USDC target</span></div>
                    {activeGoals.length === 1 && singleGoalProgress !== null && (
                      <div className="goal-progress" aria-label={`${singleGoalProgress}% of goal target`}>
                        <div className="goal-progress__track"><span style={{ width: `${Math.min(singleGoalProgress, 100)}%` }} /></div>
                        <small>{singleGoalProgress.toFixed(0)}% funded</small>
                      </div>
                    )}
                  </div>
                  <div className="goal-card__footer">
                    <span>{currentCommitment ? commitmentTitle(currentCommitment) : "No commitment yet"}</span>
                    <span>{currentCommitment ? commitmentStatus(currentCommitment.state) : "Add one"}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="dashboard-section" aria-labelledby="week-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">This week</p>
            <h2 id="week-heading">Your commitments</h2>
          </div>
        </div>
        {activeCommitments.length === 0 ? (
          <div className="empty-state"><div><h3>No active commitments.</h3><p>Open a goal and add one when you’re ready. Commitments never lock your savings.</p></div></div>
        ) : (
          <div className="commitment-list">
            {activeCommitments.map((commitment) => {
              const goal = goals.find((item) => item.id === commitment.savingsGoalId);
              return (
                <article className="commitment-row" key={commitment.id}>
                  <div>
                    <span className="goal-card__label">{goal?.name ?? "Goal"}</span>
                    <h3>{commitmentTitle(commitment)}</h3>
                  </div>
                  <span className="status-pill">{commitmentStatus(commitment.state)}</span>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="dashboard-section" aria-labelledby="money-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Your money</p>
            <h2 id="money-heading">Available whenever you need it</h2>
          </div>
        </div>
        <div className="money-panel">
          <div>
            <strong>{positionState.kind === "ready" ? `${formatUsdc(positionState.position.assets)} USDC` : "—"}</strong>
            <span>currently in Kept</span>
          </div>
          <div className="money-panel__actions">
            <button className="button button--secondary" type="button" onClick={onAddMoney}>Add money</button>
            <button className="button button--quiet" type="button" disabled={positionState.kind !== "ready" || positionState.position.assets === 0n} onClick={() => setWithdrawalOpen(true)}>Withdraw</button>
          </div>
        </div>
      </section>

      {fundingOpen && (
        <DepositModal amount={depositAmount} error={depositError} isReady={positionState.kind === "ready"} status={depositStatus} walletAddress={walletAddress} onAmountChange={onDepositAmountChange} onClose={onCloseFunding} onSubmit={onSubmitDeposit} />
      )}
      {withdrawalOpen && positionState.kind === "ready" && (
        <WithdrawalModal amount={withdrawAmount} error={withdrawError} position={positionState.position} status={withdrawStatus} onAmountChange={onWithdrawAmountChange} onClose={() => setWithdrawalOpen(false)} onSubmit={onSubmitWithdrawal} />
      )}
      {accountOpen && walletAddress && (
        <AccountModal positionState={positionState} walletAddress={walletAddress} onClose={onCloseAccount} onSignOut={onSignOut} />
      )}
      {createGoalOpen && (
        <CreateGoalModal submitting={creatingGoal} error={goalError} onClose={() => setCreateGoalOpen(false)} onSubmit={onCreateGoal} />
      )}
      {selectedGoal && (
        <ModalDialog ariaLabel={`${selectedGoal.name} details`} className="flow-card goal-detail" closeLabel="Close goal details" onClose={() => setSelectedGoalId(null)}>
          <div className="modal-stack">
            <div>
              <p className="eyebrow">Goal</p>
              <h2>{selectedGoal.name}</h2>
              <p className="modal-copy">Target: {targetAmount(selectedGoal)} {selectedGoal.targetAsset}{selectedGoal.targetDate ? ` by ${selectedGoal.targetDate}` : ""}.</p>
            </div>
            <div className="goal-detail__commitments">
              <div className="section-heading"><h3>Commitments</h3><button className="button button--quiet" type="button" onClick={() => { setSelectedGoalId(null); setCommitmentGoalId(selectedGoal.id); }}>+ Add commitment</button></div>
              {selectedCommitments.length === 0 ? <p className="form-note">No commitment yet. Add one when you’re ready.</p> : selectedCommitments.map((commitment) => (
                <div className="commitment-row commitment-row--compact" key={commitment.id}>
                  <div><strong>{commitmentTitle(commitment)}</strong><span>{new Date(commitment.epochEnd).toLocaleDateString()}</span></div>
                  <span className="status-pill">{commitmentStatus(commitment.state)}</span>
                </div>
              ))}
            </div>
            <p className="form-note">Savings are not locked to this goal. You can withdraw from Kept at any time.</p>
          </div>
        </ModalDialog>
      )}
      {commitmentGoal && (
        <CreateCommitmentModal goal={commitmentGoal} submitting={creatingCommitment} error={commitmentError} onClose={() => setCommitmentGoalId(null)} onSubmit={(input) => onCreateCommitment(commitmentGoal, input)} />
      )}
    </div>
  );
}
