import { useState } from "react";
import { Plus, RefreshCw } from "lucide-react";

import type { CommitmentDto, GoalDto } from "@/api/kept-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateCommitmentDialog, type CreateCommitmentInput } from "@/features/commitments/CreateCommitmentDialog";
import type { ProductDataState } from "@/features/dashboard/product-data-state";
import { CreateGoalDialog } from "@/features/goals/CreateGoalDialog";
import { GoalCard } from "@/features/goals/GoalCard";
import { GoalDetailsDialog } from "@/features/goals/GoalDetailsDialog";
import { BalanceCard, type PositionState } from "@/features/savings/BalanceCard";
import { DepositDialog } from "@/features/savings/DepositDialog";
import { WithdrawDialog } from "@/features/savings/WithdrawDialog";

interface DashboardPageProps {
  readonly walletAddress: string | null;
  readonly positionState: PositionState;
  readonly productState: ProductDataState;
  readonly depositAmount: string;
  readonly depositStatus: string | null;
  readonly depositError: string | null;
  readonly withdrawAmount: string;
  readonly withdrawStatus: string | null;
  readonly withdrawError: string | null;
  readonly pendingTransaction: "deposit" | "withdraw" | null;
  readonly creatingGoal: boolean;
  readonly goalError: string | null;
  readonly creatingCommitment: boolean;
  readonly commitmentError: string | null;
  readonly onDepositAmountChange: (value: string) => void;
  readonly onSubmitDeposit: () => void;
  readonly onWithdrawAmountChange: (value: string) => void;
  readonly onSubmitWithdrawal: () => void;
  readonly onRefreshPosition: () => void;
  readonly onRefreshProductData: () => void;
  readonly onCreateGoal: (input: {
    readonly name: string;
    readonly targetAmount: string;
    readonly targetDate: string | null;
  }) => Promise<boolean>;
  readonly onCreateCommitment: (goal: GoalDto, input: CreateCommitmentInput) => Promise<boolean>;
}

function currentCommitment(goalId: string, commitments: readonly CommitmentDto[]): CommitmentDto | undefined {
  const matches = commitments.filter((item) => item.savingsGoalId === goalId);
  return matches.find((item) => item.state === "ACTIVE") ?? matches.find((item) => item.state === "DRAFT") ?? matches[0];
}

export function DashboardPage(props: DashboardPageProps) {
  const {
    walletAddress,
    positionState,
    productState,
    depositAmount,
    depositStatus,
    depositError,
    withdrawAmount,
    withdrawStatus,
    withdrawError,
    pendingTransaction,
    creatingGoal,
    goalError,
    creatingCommitment,
    commitmentError,
    onDepositAmountChange,
    onSubmitDeposit,
    onWithdrawAmountChange,
    onSubmitWithdrawal,
    onRefreshPosition,
    onRefreshProductData,
    onCreateGoal,
    onCreateCommitment,
  } = props;

  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [createGoalOpen, setCreateGoalOpen] = useState(false);
  const [commitmentGoal, setCommitmentGoal] = useState<GoalDto | null>(null);
  const [detailGoal, setDetailGoal] = useState<GoalDto | null>(null);

  const goals = productState.goals;
  const commitments = productState.commitments;
  const activeGoals = goals.filter((goal) => goal.status === "ACTIVE");
  const initialLoading = productState.kind === "loading" && goals.length === 0;

  const detailCommitments = detailGoal
    ? commitments.filter((commitment) => commitment.savingsGoalId === detailGoal.id)
    : [];

  return (
    <div className="space-y-10">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Dashboard</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Keep moving forward.</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
            Your goals and weekly commitments in one place. The financial plumbing stays in the background.
          </p>
        </div>
        <Button variant="outline" onClick={() => setCreateGoalOpen(true)}>
          <Plus className="size-4" />
          New goal
        </Button>
      </section>

      <BalanceCard
        positionState={positionState}
        activeGoalCount={activeGoals.length}
        transactionPending={pendingTransaction !== null}
        onAddMoney={() => setDepositOpen(true)}
        onWithdraw={() => setWithdrawOpen(true)}
      />

      <section className="space-y-5" aria-labelledby="goals-heading">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="goals-heading" className="text-xl font-semibold tracking-tight">Your goals</h2>
            <p className="mt-1 text-sm text-muted-foreground">Focus on the outcome, then keep the weekly action small.</p>
          </div>
          {productState.kind === "error" && (
            <Button variant="ghost" size="sm" onClick={onRefreshProductData}>
              <RefreshCw className="size-4" />
              Retry
            </Button>
          )}
        </div>

        {productState.kind === "error" && (
          <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {productState.message}
          </p>
        )}

        {initialLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-80 rounded-xl" />
            <Skeleton className="h-80 rounded-xl" />
          </div>
        ) : activeGoals.length === 0 ? (
          <Card className="border-dashed shadow-none">
            <CardContent className="flex flex-col items-start gap-4 p-8 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold">Create your first goal</h3>
                <p className="mt-1 max-w-lg text-sm text-muted-foreground">
                  Give your savings a destination, then choose a weekly savings commitment.
                </p>
              </div>
              <Button onClick={() => setCreateGoalOpen(true)}>
                <Plus className="size-4" />
                Create goal
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {activeGoals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                commitment={currentCommitment(goal.id, commitments)}
                onAddCommitment={(selected) => setCommitmentGoal(selected)}
                onOpen={(selected) => setDetailGoal(selected)}
              />
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-col gap-2 border-t pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <button type="button" className="text-left underline-offset-4 hover:underline" onClick={onRefreshPosition}>
          Refresh balance
        </button>
      </div>

      <DepositDialog
        open={depositOpen}
        amount={depositAmount}
        status={depositStatus}
        error={depositError}
        ready={positionState.kind === "ready" && Boolean(walletAddress)}
        submitting={pendingTransaction === "deposit"}
        onOpenChange={setDepositOpen}
        onAmountChange={onDepositAmountChange}
        onSubmit={onSubmitDeposit}
      />

      <WithdrawDialog
        open={withdrawOpen}
        position={positionState.kind === "ready" ? positionState.position : null}
        amount={withdrawAmount}
        status={withdrawStatus}
        error={withdrawError}
        submitting={pendingTransaction === "withdraw"}
        onOpenChange={setWithdrawOpen}
        onAmountChange={onWithdrawAmountChange}
        onSubmit={onSubmitWithdrawal}
      />

      <CreateGoalDialog
        open={createGoalOpen}
        submitting={creatingGoal}
        error={goalError}
        onOpenChange={setCreateGoalOpen}
        onSubmit={onCreateGoal}
      />

      <CreateCommitmentDialog
        open={commitmentGoal !== null}
        goal={commitmentGoal}
        submitting={creatingCommitment}
        error={commitmentError}
        onOpenChange={(open) => {
          if (!open) setCommitmentGoal(null);
        }}
        onSubmit={onCreateCommitment}
      />

      <GoalDetailsDialog
        open={detailGoal !== null}
        goal={detailGoal}
        commitments={detailCommitments}
        onOpenChange={(open) => {
          if (!open) setDetailGoal(null);
        }}
        onAddCommitment={(goal) => {
          setDetailGoal(null);
          setCommitmentGoal(goal);
        }}
      />
    </div>
  );
}
