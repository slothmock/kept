import { useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import type { CommitmentDto, GoalDto } from "@/api/kept-api";
import { Button } from "@/components/ui/button";

import { Card, CardContent } from "@/components/ui/card";

import { Skeleton } from "@/components/ui/skeleton";

import type { ProductDataState } from "@/features/dashboard/product-data-state";

import {

  CreateCommitmentDialog,

  type CreateCommitmentInput,

} from "@/features/commitments/CreateCommitmentDialog";

import {

  AddFundsDialog,

} from "@/features/funding/AddFundsDialog";

import { updateDialogOpenState } from "@/features/dashboard/dialog-lifecycle";

import { ManageGoalSavingsDialog } from "@/features/goals/ManageGoalSavingsDialog";

import { CreateGoalDialog } from "@/features/goals/CreateGoalDialog";

import { GoalCard } from "@/features/goals/GoalCard";

import { GoalDetailsDialog } from "@/features/goals/GoalDetailsDialog";

import type { GoalFundingState } from "@/features/goals/funding";

import {

  BalanceCard,

  type PositionState,

} from "@/features/savings/BalanceCard";

import {

  SavingsMarketStatus,

  type SavingsMarketStatusState,

} from "@/features/savings/SavingsMarketStatus";

import { DepositDialog } from "@/features/savings/DepositDialog";

import type { DepositQuoteState } from "@/features/savings/deposit-quote";

import { WithdrawFundsDialog } from "@/features/withdrawal/WithdrawFundsDialog";

import type { RewardState } from "@/commitments/reward-claim";

import { formatUsdc } from "@/features/savings/format";

import type { FundingAsset } from "@/features/funding/intents/supported-tokens";

interface DashboardPageProps {

  readonly walletAddress: string | null;

  readonly positionState: PositionState;

  readonly goalFundingState: GoalFundingState;

  readonly productState: ProductDataState;

  readonly depositAmount: string;

  readonly depositStatus: string | null;

  readonly depositError: string | null;

  readonly depositQuoteState: DepositQuoteState;

  readonly withdrawAmount: string;

  readonly withdrawStatus: string | null;

  readonly withdrawError: string | null;

  readonly pendingTransaction: "deposit" | "withdraw" | "commitment" | null;

  readonly creatingGoal: boolean;

  readonly deletingGoal: boolean;

  readonly deleteGoalStatus: string | null;

  readonly deleteGoalError: string | null;

  readonly rewardStates: Readonly<Record<string, RewardState>>;

  readonly claimingRewardId: string | null;

  readonly rewardClaimError: {

    readonly commitmentId: string;

    readonly message: string;

  } | null;

  readonly savingsPerformanceState:

  | {

    readonly kind: "unavailable";

  }

  | {

    readonly kind: "loading";

  }

  | {

    readonly kind: "ready";

    readonly earningsAssets: bigint;

  }

  | {

    readonly kind: "error";

  };

  readonly savingsMarketStatusState: SavingsMarketStatusState;

  readonly onRefreshSavingsPerformance: () => void;

  readonly onRefreshSavingsMarketStatus: () => void;

  readonly stagingFaucetAvailable: boolean;

  readonly stagingFaucetClaiming: boolean;

  readonly stagingFaucetStatus: string | null;

  readonly stagingFaucetError: string | null;

  readonly onClaimStagingFaucet: () => void;

  readonly onDeleteGoal: (goal: GoalDto) => Promise<boolean>;

  readonly onDismissGoalDeletion: () => void;

  readonly goalError: string | null;

  readonly creatingCommitment: boolean;

  readonly commitmentStatus: string | null;

  readonly commitmentError: string | null;

  readonly allocatingGoal: boolean;

  readonly allocationStatus: string | null;

  readonly allocationError: string | null;

  readonly onDepositAmountChange: (value: string) => void;

  readonly onSubmitDeposit: () => void;

  readonly onDismissDeposit: () => void;

  readonly onWithdrawAmountChange: (value: string) => void;

  readonly onSubmitWithdrawal: () => void;

  readonly onDismissWithdrawal: () => void;

  readonly onRefreshPosition: () => void;

  readonly onRefreshProductData: () => void;

  readonly onCreateGoal: (input: {

    readonly name: string;

    readonly targetAmount: string;

    readonly targetDate: string | null;

  }) => Promise<boolean>;

  readonly onCreateCommitment: (

    goal: GoalDto,

    input: CreateCommitmentInput,

  ) => Promise<boolean>;

  readonly onAddToGoal: (goal: GoalDto, amount: string) => Promise<boolean>;

  readonly onRemoveFromGoal: (

    goal: GoalDto,

    amount: string,

  ) => Promise<boolean>;

  readonly onMoveBetweenGoals: (

    fromGoal: GoalDto,

    toGoal: GoalDto,

    amount: string,

  ) => Promise<boolean>;

  readonly onDismissGoal: () => void;

  readonly onDismissCommitment: () => void;

  readonly onDismissAllocation: () => void;

  readonly onClaimReward: (commitment: CommitmentDto) => Promise<boolean>;

  readonly cryptoAmount:

  string;

  readonly cryptoRecipient:

  string;

  readonly cryptoDestinationAssets:

  readonly FundingAsset[];

  readonly cryptoDestinationAssetId:

  string | null;

  readonly cryptoPreviewing:

  boolean;

  readonly cryptoPreviewReady:

  boolean;

  readonly cryptoPreviewStatus:

  string | null;

  readonly cryptoPreviewError:

  string | null;

  readonly cryptoExecuting:

  boolean;

  readonly cryptoExecutionStatus:

  string | null;

  readonly cryptoExecutionError:

  string | null;

  readonly cryptoEstimatedReceive:

  string | null;

  readonly onCryptoAmountChange: (

    value: string,

  ) => void;

  readonly onCryptoRecipientChange: (

    value: string,

  ) => void;

  readonly onCryptoDestinationAssetChange: (

    assetId: string,

  ) => void;

  readonly onPreviewCryptoWithdrawal:

  () => void;

  readonly onExecuteCryptoWithdrawal:

  () => void;

  readonly bankAmount:

  string;

  readonly bankSubmitting:

  boolean;

  readonly bankStatus:

  string | null;

  readonly bankError:

  string | null;

  readonly onBankAmountChange: (

    value: string,

  ) => void;

  readonly onStartBankWithdrawal:

  () => void;

}

function currentCommitment(

  goalId: string,

  commitments: readonly CommitmentDto[],

): CommitmentDto | undefined {

  const matches = commitments.filter((item) => item.savingsGoalId === goalId);

  return (

    matches.find((item) => item.state === "ACTIVE") ??

    matches.find((item) => item.state === "DRAFT") ??

    matches[0]

  );

}

export function DashboardPage(props: DashboardPageProps) {

  const {

    walletAddress,

    positionState,

    savingsPerformanceState,

    savingsMarketStatusState,

    goalFundingState,

    productState,

    depositAmount,

    depositStatus,

    depositError,

    depositQuoteState,

    withdrawAmount,

    withdrawStatus,

    withdrawError,

    pendingTransaction,

    creatingGoal,

    deletingGoal,

    deleteGoalStatus,

    deleteGoalError,

    onDeleteGoal,

    onDismissGoalDeletion,

    goalError,

    creatingCommitment,

    commitmentStatus,

    commitmentError,

    rewardStates,

    claimingRewardId,

    rewardClaimError,

    onClaimReward,

    allocatingGoal,

    allocationStatus,

    allocationError,

    onDepositAmountChange,

    onSubmitDeposit,

    onDismissDeposit,

    onWithdrawAmountChange,

    onSubmitWithdrawal,

    onDismissWithdrawal,

    onRefreshPosition,

    onRefreshProductData,

    onRefreshSavingsPerformance,

    onRefreshSavingsMarketStatus,

    stagingFaucetAvailable,

    stagingFaucetClaiming,

    stagingFaucetStatus,

    stagingFaucetError,

    onClaimStagingFaucet,

    onCreateGoal,

    onCreateCommitment,

    onAddToGoal,

    onDismissGoal,

    onRemoveFromGoal,

    onMoveBetweenGoals,

    onDismissCommitment,

    onDismissAllocation,

    cryptoAmount,

    cryptoRecipient,

    cryptoDestinationAssets,

    cryptoDestinationAssetId,

    cryptoPreviewing,

    cryptoPreviewReady,

    cryptoPreviewStatus,

    cryptoPreviewError,

    cryptoExecuting,

    cryptoExecutionStatus,

    cryptoExecutionError,

    cryptoEstimatedReceive,

    onCryptoAmountChange,

    onCryptoRecipientChange,

    onCryptoDestinationAssetChange,

    onPreviewCryptoWithdrawal,

    onExecuteCryptoWithdrawal,

    bankAmount,

    bankSubmitting,

    bankStatus,

    bankError,

    onBankAmountChange,

    onStartBankWithdrawal,

  } = props;

  const [addFundsOpen, setAddFundsOpen] = useState(false);

  const [depositOpen, setDepositOpen] = useState(false);

  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const [createGoalOpen, setCreateGoalOpen] = useState(false);

  const [commitmentGoal, setCommitmentGoal] = useState<GoalDto | null>(null);

  const [savingsGoal, setSavingsGoal] = useState<GoalDto | null>(null);

  const [detailGoal, setDetailGoal] = useState<GoalDto | null>(null);

  const goals = productState.goals;

  const commitments = productState.commitments;

  const activeGoals = goals.filter((goal) => goal.status === "ACTIVE");

  const initialLoading = productState.kind === "loading" && goals.length === 0;

  const detailCommitments = detailGoal

    ? commitments.filter(

      (commitment) => commitment.savingsGoalId === detailGoal.id,

    )

    : [];

  const commitmentForDialog = commitmentGoal

    ? currentCommitment(commitmentGoal.id, commitments)

    : undefined;

  const unassignedSavings =

    goalFundingState.kind === "ready" && positionState.kind === "ready"

      ? goalFundingState.funding.totalVaultShares === 0n &&

        positionState.position.shares > 0n

        ? positionState.position.assets

        : goalFundingState.funding.unallocatedAssets

      : null;

  return (

    <div className="space-y-10">

      <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">

        <div>

          <p className="text-sm font-medium text-primary">Dashboard</p>

          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">

            Keep moving forward.

          </h1>

          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">

            Track your savings, goals, commitments, and rewards in one place.

          </p>

        </div>

        <SavingsMarketStatus state={savingsMarketStatusState} />

      </section>

      <BalanceCard

        positionState={positionState}

        savingsPerformanceState={savingsPerformanceState}

        transactionPending={pendingTransaction !== null}

        onAddMoney={() => {

          setAddFundsOpen(true);

        }}

        onWithdraw={() => setWithdrawOpen(true)}

        onRefresh={() => {

          onRefreshPosition();

          onRefreshProductData();

          onRefreshSavingsPerformance();

          onRefreshSavingsMarketStatus();

        }}

        stagingFaucetAvailable={stagingFaucetAvailable}

        stagingFaucetClaiming={stagingFaucetClaiming}

        stagingFaucetStatus={stagingFaucetStatus}

        stagingFaucetError={stagingFaucetError}

        onClaimStagingFaucet={onClaimStagingFaucet}

      />

      <section className="space-y-5" aria-labelledby="goals-heading">

        <div className="flex items-end justify-between gap-4">

          <div>

            <h2

              id="goals-heading"

              className="text-xl font-semibold tracking-tight"

            >

              Your savings goals

            </h2>

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

        {unassignedSavings !== null && (

          <div className="flex flex-col gap-3 rounded-lg border bg-muted/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">

            <div>

              <p className="font-medium">Unassigned savings</p>

              <p className="mt-1 text-sm text-muted-foreground">

                Savings you haven&apos;t assigned to a goal yet.

              </p>

            </div>

            <p className="text-lg font-semibold tabular-nums">

              {formatUsdc(unassignedSavings)} USDC

            </p>

          </div>

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

                  Give your savings a destination, then choose a weekly savings

                  commitment.

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

                funding={

                  goalFundingState.kind === "loading"

                    ? null

                    : (goalFundingState.funding?.byGoal.get(goal.id) ?? null)

                }

                commitment={currentCommitment(goal.id, commitments)}

                onManageSavings={(selected) => setSavingsGoal(selected)}

                onAddCommitment={(selected) => setCommitmentGoal(selected)}

                onOpen={(selected) => setDetailGoal(selected)}

              />

            ))}

            <button

              type="button"

              onClick={() => setCreateGoalOpen(true)}

              className="

      group flex min-h-80 flex-col items-center

      justify-center gap-4 rounded-xl border

      border-dashed bg-muted/10 p-8 text-center

      transition

      hover:border-primary/40

      hover:bg-accent/30

      focus-visible:outline-none

      focus-visible:ring-2

      focus-visible:ring-ring

      focus-visible:ring-offset-2

    "

            >

              <div

                className="

        grid size-12 place-items-center rounded-full

        border bg-background text-muted-foreground

        transition

        group-hover:border-primary/30

        group-hover:text-primary

      "

              >

                <Plus className="size-5" />

              </div>

              <div>

                <h3 className="font-semibold">Create another goal</h3>

                <p className="mt-1 max-w-xs text-sm leading-6 text-muted-foreground">

                  Give more of your savings a purpose.

                </p>

              </div>

            </button>

          </div>

        )}

      </section>

      <AddFundsDialog

        open={addFundsOpen}

        walletAddress={walletAddress}

        onOpenChange={

          setAddFundsOpen

        }

        onUseAvailableCash={() => {

          setAddFundsOpen(false);

          setDepositOpen(true);

        }}

      />

      <DepositDialog

        open={depositOpen}

        amount={depositAmount}

        status={depositStatus}

        error={depositError}

        quoteState={depositQuoteState}

        availableBalance={

          positionState.kind === "ready"

            ? positionState.position.usdcBalance

            : null

        }

        ready={positionState.kind === "ready" && Boolean(walletAddress)}

        submitting={pendingTransaction === "deposit"}

        onOpenChange={(open) =>

          updateDialogOpenState(open, setDepositOpen, onDismissDeposit)

        }

        onAmountChange={onDepositAmountChange}

        onSubmit={onSubmitDeposit}

      />

      <WithdrawFundsDialog

        open={withdrawOpen}

        position={

          positionState.kind === "ready"

            ? positionState.position

            : null

        }

        amount={withdrawAmount}

        status={withdrawStatus}

        error={withdrawError}

        submitting={

          pendingTransaction ===

          "withdraw"

        }

        cryptoAvailable={

          cryptoDestinationAssets.length >

          0

        }

        cryptoAmount={

          cryptoAmount

        }

        cryptoRecipient={

          cryptoRecipient

        }

        cryptoDestinationAssets={

          cryptoDestinationAssets

        }

        cryptoDestinationAssetId={

          cryptoDestinationAssetId

        }

        cryptoPreviewing={

          cryptoPreviewing

        }

        cryptoPreviewReady={

          cryptoPreviewReady

        }

        cryptoPreviewStatus={

          cryptoPreviewStatus

        }

        cryptoPreviewError={

          cryptoPreviewError

        }

        cryptoExecuting={

          cryptoExecuting

        }

        cryptoExecutionStatus={

          cryptoExecutionStatus

        }

        cryptoExecutionError={

          cryptoExecutionError

        }

        cryptoEstimatedReceive={

          cryptoEstimatedReceive

        }

        onOpenChange={(open) =>

          updateDialogOpenState(

            open,

            setWithdrawOpen,

            onDismissWithdrawal,

          )

        }

        onAmountChange={

          onWithdrawAmountChange

        }

        onSubmitAvailableCash={

          onSubmitWithdrawal

        }

        onCryptoAmountChange={

          onCryptoAmountChange

        }

        onCryptoRecipientChange={

          onCryptoRecipientChange

        }

        onCryptoDestinationAssetChange={

          onCryptoDestinationAssetChange

        }

        onPreviewCryptoWithdrawal={

          onPreviewCryptoWithdrawal

        }

        onExecuteCryptoWithdrawal={

          onExecuteCryptoWithdrawal

        }

        bankAvailable={true}

        bankAmount={

          bankAmount

        }

        bankSubmitting={

          bankSubmitting

        }

        bankStatus={

          bankStatus

        }

        bankError={

          bankError

        }

        onBankAmountChange={

          onBankAmountChange

        }

        onStartBankWithdrawal={

          onStartBankWithdrawal

        }

      />

      <CreateGoalDialog

        open={createGoalOpen}

        submitting={creatingGoal}

        error={goalError}

        onOpenChange={(open) =>

          updateDialogOpenState(open, setCreateGoalOpen, onDismissGoal)

        }

        onSubmit={onCreateGoal}

      />

      <ManageGoalSavingsDialog

        goal={savingsGoal}

        goals={activeGoals}
        allocatedAssets={
          savingsGoal && goalFundingState.kind === "ready"
            ? (goalFundingState.funding.byGoal.get(savingsGoal.id)
              ?.allocatedAssets ?? 0n)
            : null
        }
        unallocatedAssets={
          goalFundingState.kind === "ready"
            ? goalFundingState.funding.unallocatedAssets
            : null
        }
        submitting={allocatingGoal}
        status={allocationStatus}
        error={allocationError}
        onOpenChange={(open) => {
          if (!open) {
            setSavingsGoal(null);
            onDismissAllocation();
          }
        }}
        onAdd={onAddToGoal}
        onRemove={onRemoveFromGoal}
        onMove={onMoveBetweenGoals}
      />
      <CreateCommitmentDialog
        open={commitmentGoal !== null}
        goal={commitmentGoal}
        draft={
          commitmentForDialog?.state === "DRAFT" ? commitmentForDialog : null
        }
        submitting={creatingCommitment}
        status={commitmentStatus}
        error={commitmentError}
        onOpenChange={(open) => {
          if (!open) {
            setCommitmentGoal(null);
            onDismissCommitment();
          }
        }}
        onSubmit={onCreateCommitment}
      />
      <GoalDetailsDialog
        open={detailGoal !== null}
        goal={detailGoal}
        funding={
          detailGoal && goalFundingState.kind !== "loading"
            ? (goalFundingState.funding?.byGoal.get(detailGoal.id) ?? null)
            : null
        }
        commitments={detailCommitments}
        rewardStates={rewardStates}
        claimingRewardId={claimingRewardId}
        rewardClaimError={rewardClaimError}
        onClaimReward={onClaimReward}
        deleting={deletingGoal}
        deleteStatus={deleteGoalStatus}
        deleteError={deleteGoalError}
        onDelete={onDeleteGoal}
        onOpenChange={(open) => {
          if (!open) {
            setDetailGoal(null);
            onDismissGoalDeletion();
          }
        }}
        onAddToSavings={() => {
          setDetailGoal(null);
          setDepositOpen(true);
        }}
        onManageSavings={(goal) => {
          setDetailGoal(null);
          setSavingsGoal(goal);
        }}
        onAddCommitment={(goal) => {
          setDetailGoal(null);
          setCommitmentGoal(goal);
        }}
      />
    </div>
  );
}
