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

import { readFiatEnabled } from "@/config/feature-flags";

import type { FundingAsset } from "@/features/funding/intents/supported-tokens";

interface DashboardPageProps {

  readonly walletAddress: string | null;

  readonly readSolanaFundingBalances: (
    owner: string,
  ) => Promise<{
    readonly nativeBalance: string;
    readonly balances: Readonly<Record<string, string>>;
  }>;

  readonly goalFundingState: GoalFundingState;

  readonly productState: ProductDataState;

  readonly savingsTransactions: {

    readonly deposit: {

      readonly amount:
      string;

      readonly status:
      string | null;

      readonly error:
      string | null;

      readonly quoteState:
      DepositQuoteState;

      readonly onAmountChange: (
        value: string,
      ) => void;

      readonly onSubmit:
      () => Promise<boolean>;

      readonly onDismiss:
      () => void;

    };

    readonly withdrawal: {

      readonly amount:
      string;

      readonly status:
      string | null;

      readonly error:
      string | null;

      readonly onAmountChange: (
        value: string,
      ) => void;

      readonly onSubmit:
      () => Promise<boolean>;

      readonly onDismiss:
      () => void;

    };

    readonly pendingTransaction:
    "deposit" | "withdraw" | "commitment" | null;

  };

  readonly goalManagement: {

    readonly creation: {

      readonly creating:
      boolean;

      readonly error:
      string | null;

      readonly onCreate: (input: {

        readonly name: string;

        readonly targetAmount: string;

        readonly targetDate: string | null;

      }) => Promise<boolean>;

      readonly onDismiss:
      () => void;

    };

    readonly deletion: {

      readonly deleting:
      boolean;

      readonly status:
      string | null;

      readonly error:
      string | null;

      readonly onDelete: (
        goal: GoalDto,
      ) => Promise<boolean>;

      readonly onDismiss:
      () => void;

    };

    readonly allocation: {

      readonly allocating:
      boolean;

      readonly status:
      string | null;

      readonly error:
      string | null;

      readonly onAdd: (
        goal: GoalDto,
        amount: string,
      ) => Promise<boolean>;

      readonly onRemove: (
        goal: GoalDto,
        amount: string,
      ) => Promise<boolean>;

      readonly onMove: (
        fromGoal: GoalDto,
        toGoal: GoalDto,
        amount: string,
      ) => Promise<boolean>;

      readonly onDismiss:
      () => void;

    };

    readonly commitment: {

      readonly creating:
      boolean;

      readonly status:
      string | null;

      readonly error:
      string | null;

      readonly onCreate: (
        goal: GoalDto,
        input: CreateCommitmentInput,
      ) => Promise<boolean>;

      readonly onDismiss:
      () => void;

    };

    readonly rewards: {

      readonly states:
      Readonly<Record<string, RewardState>>;

      readonly claimingId:
      string | null;

      readonly claimError: {

        readonly commitmentId:
        string;

        readonly message:
        string;

      } | null;

      readonly onClaim: (
        commitment: CommitmentDto,
      ) => Promise<boolean>;

    };

  };

  readonly savingsOverview: {

    readonly positionState:
    PositionState;

    readonly performanceState:

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

      readonly kind: "synchronizing";

      readonly progressPercent: number | null;

    }

    | {

      readonly kind: "error";

    };

    readonly marketStatusState:
    SavingsMarketStatusState;

    readonly onRefreshPosition:
    () => Promise<void>;

    readonly onRefreshPerformance:
    () => Promise<void>;

    readonly onRefreshMarketStatus:
    () => Promise<void>;

    readonly stagingFaucet: {

      readonly available:
      boolean;

      readonly claiming:
      boolean;

      readonly status:
      string | null;

      readonly error:
      string | null;

      readonly onClaim:
      () => void;

    };

  };

  readonly onRefreshProductData: () => Promise<void>;

  readonly cryptoWithdrawal: {

    readonly amount:
    string;

    readonly recipient:
    string;

    readonly destinationAssets:
    readonly FundingAsset[];

    readonly destinationAssetId:
    string | null;

    readonly previewing:
    boolean;

    readonly previewReady:
    boolean;

    readonly previewStatus:
    string | null;

    readonly previewError:
    string | null;

    readonly executing:
    boolean;

    readonly executionStatus:
    string | null;

    readonly executionError:
    string | null;

    readonly estimatedReceive:
    string | null;

    readonly onAmountChange: (
      value: string,
    ) => void;

    readonly onRecipientChange: (
      value: string,
    ) => void;

    readonly onDestinationAssetChange: (
      assetId: string,
    ) => void;

    readonly onPreview:
    () => void;

    readonly onExecute:
    () => void;

  };

  readonly bankWithdrawal: {

    readonly amount:
    string;

    readonly submitting:
    boolean;

    readonly status:
    string | null;

    readonly error:
    string | null;

    readonly orderId:
    string | null;

    readonly phase:
    | "setup"
    | "moonpay"
    | "waiting"
    | "review"
    | "sending"
    | "processing"
    | "complete"
    | "failed";

    readonly reviewAmount:
    string | null;

    readonly minimumReceive:
    string | null;

    readonly onAmountChange: (
      value: string,
    ) => void;

    readonly onStart:
    () => void;

    readonly onRefresh:
    () => void;

    readonly onConfirm:
    () => void;

  };

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

  const fiatEnabled =
    readFiatEnabled(
      import.meta.env,
    );

  const {

    walletAddress,

    readSolanaFundingBalances,

    savingsOverview,

    goalFundingState,

    productState,

    savingsTransactions,

    goalManagement,

    onRefreshProductData,

    cryptoWithdrawal,

    bankWithdrawal,

  } = props;

  const [addFundsOpen, setAddFundsOpen] = useState(false);

  const [depositOpen, setDepositOpen] = useState(false);

  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const [dismissedBankOrderId, setDismissedBankOrderId] =
    useState<string | null>(null);

  const [createGoalOpen, setCreateGoalOpen] = useState(false);

  const [commitmentGoal, setCommitmentGoal] = useState<GoalDto | null>(null);

  const [savingsGoal, setSavingsGoal] = useState<GoalDto | null>(null);

  const [detailGoal, setDetailGoal] = useState<GoalDto | null>(null);

  const bankFlowNeedsAttention =
    bankWithdrawal.phase !== "setup"
    && bankWithdrawal.orderId !== null
    && dismissedBankOrderId !== bankWithdrawal.orderId;

  const withdrawDialogOpen =
    withdrawOpen || bankFlowNeedsAttention;

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

    goalFundingState.kind === "ready" && savingsOverview.positionState.kind === "ready"

      ? goalFundingState.funding.totalVaultShares === 0n &&

        savingsOverview.positionState.position.shares > 0n

        ? savingsOverview.positionState.position.assets

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

        <SavingsMarketStatus state={savingsOverview.marketStatusState} />

      </section>

      <BalanceCard

        positionState={positionState}

        savingsPerformanceState={savingsOverview.performanceState}

        transactionPending={savingsTransactions.pendingTransaction !== null}

        onAddMoney={() => {

          setAddFundsOpen(true);

        }}

        onWithdraw={() => setWithdrawOpen(true)}

        onRefresh={async () => {
          await savingsOverview.onRefreshPosition();

          await onRefreshProductData();

          await savingsOverview.onRefreshPerformance();

          await savingsOverview.onRefreshMarketStatus();
        }}

        stagingFaucetAvailable={savingsOverview.stagingFaucet.available}

        stagingFaucetClaiming={savingsOverview.stagingFaucet.claiming}

        stagingFaucetStatus={savingsOverview.stagingFaucet.status}

        stagingFaucetError={savingsOverview.stagingFaucet.error}

        onClaimStagingFaucet={savingsOverview.stagingFaucet.onClaim}

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

        fiatEnabled={fiatEnabled}

        readSolanaFundingBalances={
          readSolanaFundingBalances
        }

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

        amount={savingsTransactions.deposit.amount}

        status={savingsTransactions.deposit.status}

        error={savingsTransactions.deposit.error}

        quoteState={savingsTransactions.deposit.quoteState}

        availableBalance={

          savingsOverview.positionState.kind === "ready"

            ? savingsOverview.positionState.position.usdcBalance

            : null

        }

        ready={savingsOverview.positionState.kind === "ready" && Boolean(walletAddress)}

        submitting={savingsTransactions.pendingTransaction === "deposit"}

        onOpenChange={(open) =>

          updateDialogOpenState(open, setDepositOpen, savingsTransactions.deposit.onDismiss)

        }

        onAmountChange={savingsTransactions.deposit.onAmountChange}

        onSubmit={() => {
          void (
            async () => {
              const succeeded =
                await savingsTransactions.deposit.onSubmit();

              if (succeeded) {
                setDepositOpen(false);
              }
            }
          )();
        }}

      />

      <WithdrawFundsDialog

        open={withdrawDialogOpen}

        position={

          savingsOverview.positionState.kind === "ready"

            ? savingsOverview.positionState.position

            : null

        }

        amount={savingsTransactions.withdrawal.amount}

        status={savingsTransactions.withdrawal.status}

        error={savingsTransactions.withdrawal.error}

        submitting={

          savingsTransactions.pendingTransaction ===

          "withdraw"

        }

        cryptoAvailable={

          cryptoWithdrawal.destinationAssets.length >

          0

        }

        cryptoAmount={

          cryptoWithdrawal.amount

        }

        cryptoRecipient={

          cryptoWithdrawal.recipient

        }

        cryptoDestinationAssets={

          cryptoWithdrawal.destinationAssets

        }

        cryptoDestinationAssetId={

          cryptoWithdrawal.destinationAssetId

        }

        cryptoPreviewing={

          cryptoWithdrawal.previewing

        }

        cryptoPreviewReady={

          cryptoWithdrawal.previewReady

        }

        cryptoPreviewStatus={

          cryptoWithdrawal.previewStatus

        }

        cryptoPreviewError={

          cryptoWithdrawal.previewError

        }

        cryptoExecuting={

          cryptoWithdrawal.executing

        }

        cryptoExecutionStatus={

          cryptoWithdrawal.executionStatus

        }

        cryptoExecutionError={

          cryptoWithdrawal.executionError

        }

        cryptoEstimatedReceive={

          cryptoWithdrawal.estimatedReceive

        }

        onOpenChange={(open) => {
          if (!open && bankFlowNeedsAttention) {
            setDismissedBankOrderId(bankWithdrawal.orderId);
          }

          updateDialogOpenState(
            open,
            setWithdrawOpen,
            savingsTransactions.withdrawal.onDismiss,
          );
        }}

        onAmountChange={

          savingsTransactions.withdrawal.onAmountChange

        }

        onSubmitAvailableCash={() => {
          void (
            async () => {
              const succeeded =
                await savingsTransactions.withdrawal.onSubmit();

              if (succeeded) {
                setWithdrawOpen(false);
              }
            }
          )();
        }}
        

        onCryptoAmountChange={

          cryptoWithdrawal.onAmountChange

        }

        onCryptoRecipientChange={

          cryptoWithdrawal.onRecipientChange

        }

        onCryptoDestinationAssetChange={

          cryptoWithdrawal.onDestinationAssetChange

        }

        onPreviewCryptoWithdrawal={

          cryptoWithdrawal.onPreview

        }

        onExecuteCryptoWithdrawal={

          cryptoWithdrawal.onExecute

        }

        bankAvailable={true}

        bankEnabled={fiatEnabled}

        bankAmount={

          bankWithdrawal.amount

        }

        bankSubmitting={

          bankWithdrawal.submitting

        }

        bankStatus={

          bankWithdrawal.status

        }

        bankError={

          bankWithdrawal.error

        }

        bankPhase={
          bankWithdrawal.phase
        }

        bankReviewAmount={
          bankWithdrawal.reviewAmount
        }

        bankMinimumReceive={
          bankWithdrawal.minimumReceive
        }

        onBankAmountChange={

          bankWithdrawal.onAmountChange

        }

        onStartBankWithdrawal={

          bankWithdrawal.onStart

        }

        onRefreshBankWithdrawal={
          bankWithdrawal.onRefresh
        }

        onConfirmBankWithdrawal={
          bankWithdrawal.onConfirm
        }

      />

      <CreateGoalDialog

        open={createGoalOpen}

        submitting={goalManagement.creation.creating}

        error={goalManagement.creation.error}

        onOpenChange={(open) =>

          updateDialogOpenState(open, setCreateGoalOpen, goalManagement.creation.onDismiss)

        }

        onSubmit={goalManagement.creation.onCreate}

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
        submitting={goalManagement.allocation.allocating}
        status={goalManagement.allocation.status}
        error={goalManagement.allocation.error}
        onOpenChange={(open) => {
          if (!open) {
            setSavingsGoal(null);
            goalManagement.allocation.onDismiss();
          }
        }}
        onAdd={goalManagement.allocation.onAdd}
        onRemove={goalManagement.allocation.onRemove}
        onMove={goalManagement.allocation.onMove}
      />
      <CreateCommitmentDialog
        open={commitmentGoal !== null}
        goal={commitmentGoal}
        draft={
          commitmentForDialog?.state === "DRAFT" ? commitmentForDialog : null
        }
        submitting={goalManagement.commitment.creating}
        status={goalManagement.commitment.status}
        error={goalManagement.commitment.error}
        onOpenChange={(open) => {
          if (!open) {
            setCommitmentGoal(null);
            goalManagement.commitment.onDismiss();
          }
        }}
        onSubmit={goalManagement.commitment.onCreate}
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
        rewardStates={goalManagement.rewards.states}
        claimingRewardId={goalManagement.rewards.claimingId}
        rewardClaimError={goalManagement.rewards.claimError}
        onClaimReward={goalManagement.rewards.onClaim}
        deleting={goalManagement.deletion.deleting}
        deleteStatus={goalManagement.deletion.status}
        deleteError={goalManagement.deletion.error}
        onDelete={goalManagement.deletion.onDelete}
        onOpenChange={(open) => {
          if (!open) {
            setDetailGoal(null);
            goalManagement.deletion.onDismiss();
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
