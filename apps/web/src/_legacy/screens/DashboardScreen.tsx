import { useMemo, useState } from "react";

import type {
  CommitmentDto,
  GoalDto,
} from "../api/kept-api.js";

import { AccountModal } from "../features/dashboard/AccountModal.js";
import { CommitmentsSection } from "../features/dashboard/CommitmentsSection.js";
import { CreateCommitmentModal } from "../features/dashboard/CreateCommitmentModal.js";
import { CreateGoalModal } from "../features/dashboard/CreateGoalModal.js";
import { DashboardSummary } from "../features/dashboard/DashboardSummary.js";
import { DepositModal } from "../features/dashboard/DepositModal.js";
import { GoalDetailModal } from "../features/dashboard/GoalDetailModal.js";
import { GoalsSection } from "../features/dashboard/GoalsSection.js";
import { MoneySection } from "../features/dashboard/MoneySection.js";
import {
  getActiveCommitments,
  getActiveGoals,
  getGoalCommitments,
  getSingleGoalProgress,
} from "../features/dashboard/selectors.js";

import type {
  DashboardModal,
  DashboardPositionState,
} from "../features/dashboard/types.js";

import { WithdrawalModal } from "../features/dashboard/WithdrawalModal.js";

export type {
  DashboardPositionState,
} from "../features/dashboard/types.js";

export type ProductDataState =
  | {
    readonly kind: "loading";
  }
  | {
    readonly kind: "ready";
    readonly goals: readonly GoalDto[];
    readonly commitments: readonly CommitmentDto[];
  }
  | {
    readonly kind: "error";
    readonly message: string;
    readonly goals: readonly GoalDto[];
    readonly commitments: readonly CommitmentDto[];
  };

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

  readonly onDepositAmountChange: (
    value: string,
  ) => void;

  readonly onSubmitDeposit: () => void;

  readonly onWithdrawAmountChange: (
    value: string,
  ) => void;

  readonly onSubmitWithdrawal: () => void;

  readonly onRefreshProductData: () => void;

  readonly onCreateGoal: (input: {
    readonly name: string;
    readonly targetAmount: string;
    readonly targetDate: string | null;
  }) => Promise<boolean>;

  readonly onCreateCommitment: (
    goal: GoalDto,
    input: {
      readonly code:
      | "WEEKLY_SAVINGS_V1"
      | "ACTIVITY_COUNT_V1";

      readonly target: string;
      readonly startAt: Date;
      readonly endAt: Date;
      readonly verificationDeadline: Date;
    },
  ) => Promise<boolean>;
}

export function DashboardScreen(
  props: DashboardScreenProps,
) {
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
    onRefreshProductData,
    onCreateGoal,
    onCreateCommitment,
  } = props;

  const [modal, setModal] =
    useState<DashboardModal>({
      type: "none",
    });

  const goals =
    productState.kind === "loading"
      ? []
      : productState.goals;

  const commitments =
    productState.kind === "loading"
      ? []
      : productState.commitments;

  const activeGoals = getActiveGoals(goals);

  const activeCommitments =
    getActiveCommitments(commitments);

  const selectedGoal =
    modal.type === "goal-detail"
      ? goals.find(
        (goal) => goal.id === modal.goalId,
      ) ?? null
      : null;

  const commitmentGoal =
    modal.type === "create-commitment"
      ? goals.find(
        (goal) => goal.id === modal.goalId,
      ) ?? null
      : null;

  const selectedCommitments =
    selectedGoal
      ? getGoalCommitments(
        selectedGoal.id,
        commitments,
      )
      : [];

  const singleGoalProgress = useMemo(
    () =>
      getSingleGoalProgress(
        activeGoals,
        positionState,
      ),
    [activeGoals, positionState],
  );

  return (
    <div className="dashboard">
      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">
            Your Kept account
          </p>

          <h1>
            Keep moving towards what matters.
          </h1>

          <p className="dashboard-hero__description">
            Set goals, choose commitments, and keep
            your savings productive in the background.
            Your money remains withdrawable at any
            time.
          </p>
        </div>

        <div className="dashboard-hero__actions">
          <button
            className="button button--secondary"
            type="button"
            onClick={() =>
              setModal({
                type: "create-goal",
              })
            }
          >
            New goal
          </button>

          <button
            className="button button--primary"
            type="button"
            onClick={onAddMoney}
          >
            Add money
          </button>
        </div>
      </section>

      <DashboardSummary
        positionState={positionState}
        loading={productState.kind === "loading"}
        activeGoalCount={activeGoals.length}
        activeCommitmentCount={
          activeCommitments.length
        }
      />

      {productState.kind === "error" && (
        <div className="message message--error">
          <p>{productState.message}</p>

          <button
            className="button button--quiet"
            type="button"
            onClick={onRefreshProductData}
          >
            Try again
          </button>
        </div>
      )}

      <GoalsSection
        goals={activeGoals}
        commitments={commitments}
        loading={productState.kind === "loading"}
        singleGoalProgress={
          singleGoalProgress
        }
        onCreateGoal={() =>
          setModal({
            type: "create-goal",
          })
        }
        onSelectGoal={(goalId) =>
          setModal({
            type: "goal-detail",
            goalId,
          })
        }
      />

      <CommitmentsSection
        commitments={activeCommitments}
        goals={goals}
      />

      <MoneySection
        positionState={positionState}
        onAddMoney={onAddMoney}
        onWithdraw={() =>
          setModal({
            type: "withdraw",
          })
        }
      />

      {fundingOpen && (
        <DepositModal
          amount={depositAmount}
          error={depositError}
          isReady={
            positionState.kind === "ready"
          }
          status={depositStatus}
          walletAddress={walletAddress}
          onAmountChange={
            onDepositAmountChange
          }
          onClose={onCloseFunding}
          onSubmit={onSubmitDeposit}
        />
      )}

      {modal.type === "withdraw" &&
        positionState.kind === "ready" && (
          <WithdrawalModal
            amount={withdrawAmount}
            error={withdrawError}
            position={positionState.position}
            status={withdrawStatus}
            onAmountChange={
              onWithdrawAmountChange
            }
            onClose={() =>
              setModal({
                type: "none",
              })
            }
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

      {modal.type === "create-goal" && (
        <CreateGoalModal
          submitting={creatingGoal}
          error={goalError}
          onClose={() =>
            setModal({
              type: "none",
            })
          }
          onSubmit={onCreateGoal}
        />
      )}

      {selectedGoal && (
        <GoalDetailModal
          goal={selectedGoal}
          commitments={selectedCommitments}
          onClose={() =>
            setModal({
              type: "none",
            })
          }
          onAddCommitment={(goalId) =>
            setModal({
              type: "create-commitment",
              goalId,
            })
          }
        />
      )}

      {commitmentGoal && (
        <CreateCommitmentModal
          goal={commitmentGoal}
          submitting={creatingCommitment}
          error={commitmentError}
          onClose={() =>
            setModal({
              type: "none",
            })
          }
          onSubmit={(input) =>
            onCreateCommitment(
              commitmentGoal,
              input,
            )
          }
        />
      )}
    </div>
  );
}