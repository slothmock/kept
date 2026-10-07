import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Plus, RefreshCw } from "lucide-react";
import type { CommitmentDto, GoalDto } from "@/api/kept-api";
import { Button } from "@/components/ui/button";

import { Card, CardContent } from "@/components/ui/card";

import { Skeleton } from "@/components/ui/skeleton";

import type { ProductDataState } from "@/features/dashboard/product-data-state";

import { CommitmentCard } from "@/features/commitments/components/CommitmentCard";

import {

  CreateCommitmentDialog,

  type CreateCommitmentInput,

} from "@/features/commitments/components/CreateCommitmentDialog";

import {

  AddFundsDialog,

} from "@/features/funding/components/AddFundsDialog";

import { updateDialogOpenState } from "@/features/dashboard/dialog-lifecycle";

import { ManageGoalSavingsDialog } from "@/features/goals/components/ManageGoalSavingsDialog";

import { CreateGoalDialog } from "@/features/goals/components/CreateGoalDialog";

import { GoalCard } from "@/features/goals/components/GoalCard";

import { GoalDetailView } from "@/features/goals/components/GoalDetailView";

import type { GoalFundingState } from "@/features/goals/funding";

import {
  BalanceCard,
} from "@/features/savings/components/BalanceCard";

import {
  SavingsMarketStatus,
} from "@/features/savings/components/SavingsMarketStatus";

import type {
  PositionState,
  SavingsMarketStatusState,
  SavingsPerformanceState,
} from "@/features/savings/state";

import { DepositDialog } from "@/features/savings/components/DepositDialog";

import type { DepositQuoteState } from "@/features/savings/deposit-quote";

import { WithdrawFundsDialog } from "@/features/withdrawals/components/WithdrawFundsDialog";

import type { RewardState } from "@/features/commitments/reward-claim";

import { formatUsdc } from "@/features/savings/format";

import { readFiatEnabled } from "@/app/feature-flags";

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
    SavingsPerformanceState;

    readonly marketStatusState:
    SavingsMarketStatusState;

    readonly onRefreshPosition:
    () => Promise<void>;

    readonly onRefreshDashboardData:
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

  const location = useLocation();

  const navigate = useNavigate();

  const { goalId } = useParams<{ goalId: string }>();

  const goalDetailView = location.pathname.startsWith("/goals/");

  const goalsView = location.pathname === "/goals";

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


  const bankFlowNeedsAttention =
    bankWithdrawal.phase !== "setup"
    && bankWithdrawal.orderId !== null
    && dismissedBankOrderId !== bankWithdrawal.orderId;

  const withdrawDialogOpen =
    withdrawOpen || bankFlowNeedsAttention;

  const goals = productState.goals;

  const commitments = productState.commitments;

  const activeGoals = goals.filter((goal) => goal.status === "ACTIVE");

  const selectedGoal =
    goalDetailView && goalId
      ? goals.find((goal) => goal.id === goalId) ?? null
      : null;

  const selectedGoalCommitments =
    selectedGoal
      ? commitments.filter(
        (commitment) => commitment.savingsGoalId === selectedGoal.id,
      )
      : [];

  const initialLoading = productState.kind === "loading" && goals.length === 0;

  const activeCommitments = commitments.filter(
    (commitment) => commitment.state === "ACTIVE",
  );

  const featuredCommitment = activeCommitments[0] ?? null;


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

  const allocatedGoalSavings =
    goalFundingState.kind === "ready"
      ? goalFundingState.funding.totalAllocatedAssets
      : null;

  return (

    <div className="space-y-8">

      {goalDetailView ? (
        selectedGoal ? (
          <GoalDetailView
            goal={selectedGoal}
            funding={
              goalFundingState.kind !== "loading"
                ? (goalFundingState.funding?.byGoal.get(selectedGoal.id) ?? null)
                : null
            }
            commitments={selectedGoalCommitments}
            deleting={goalManagement.deletion.deleting}
            deleteStatus={goalManagement.deletion.status}
            deleteError={goalManagement.deletion.error}
            onDelete={goalManagement.deletion.onDelete}
            onBack={() => {
              goalManagement.deletion.onDismiss();
              navigate("/goals");
            }}
            onManageSavings={(goal) => setSavingsGoal(goal)}
            onAddCommitment={(goal) => setCommitmentGoal(goal)}
            rewardStates={goalManagement.rewards.states}
            claimingRewardId={goalManagement.rewards.claimingId}
            rewardClaimError={goalManagement.rewards.claimError}
            onClaimReward={goalManagement.rewards.onClaim}
            onAddToSavings={() => setDepositOpen(true)}
          />
        ) : initialLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-40 rounded-md" />
            <Skeleton className="h-28 w-full rounded-lg" />
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-64 rounded-lg" />
              <Skeleton className="h-64 rounded-lg" />
            </div>
          </div>
        ) : (
          <Card className="border-dashed shadow-none">
            <CardContent className="p-6">
              <p className="text-label font-medium">Goal not found</p>
              <p className="mt-2 text-caption text-muted-foreground">
                This goal may have been deleted or is no longer available.
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => navigate("/goals")}
              >
                Back to goals
              </Button>
            </CardContent>
          </Card>
        )
      ) : null}


      {!goalDetailView ? (
      <section className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">

        <div>

          <p className="text-caption font-medium text-primary">
            {goalsView ? "Goals" : "Home"}
          </p>

          <h1 className="mt-2 text-h1 font-semibold tracking-tight">

            {goalsView ? "Your savings goals." : "Your savings, in one place."}

          </h1>

          <p className="mt-2 max-w-2xl text-body text-muted-foreground">

            {goalsView
              ? "Give your savings a purpose and track progress towards what matters."
              : "Keep an eye on your balance, goals, commitments, and progress."}

          </p>

        </div>

        {!goalsView ? (
          <SavingsMarketStatus state={savingsOverview.marketStatusState} />
        ) : (
          <Button onClick={() => setCreateGoalOpen(true)}>
            <Plus className="size-4" />
            Create goal
          </Button>
        )}

      </section>
      ) : null}

      {goalsView ? (
        <section
          className="grid gap-4 sm:grid-cols-3"
          aria-label="Goals summary"
        >
          <Card className="shadow-none">
            <CardContent className="p-5">
              <p className="text-caption text-muted-foreground">
                Saved toward goals
              </p>
              <p className="mt-2 text-h3 font-semibold tabular-nums">
                {allocatedGoalSavings === null
                  ? "—"
                  : `${formatUsdc(allocatedGoalSavings)} USDC`}
              </p>
              <p className="mt-1 text-caption text-muted-foreground">
                Across {activeGoals.length} active {activeGoals.length === 1 ? "goal" : "goals"}
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardContent className="p-5">
              <p className="text-caption text-muted-foreground">
                Active goals
              </p>
              <p className="mt-2 text-h3 font-semibold tabular-nums">
                {activeGoals.length}
              </p>
              <p className="mt-1 text-caption text-muted-foreground">
                Currently in progress
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardContent className="p-5">
              <p className="text-caption text-muted-foreground">
                Unassigned savings
              </p>
              <p className="mt-2 text-h3 font-semibold tabular-nums">
                {unassignedSavings === null
                  ? "—"
                  : `${formatUsdc(unassignedSavings)} USDC`}
              </p>
              <p className="mt-1 text-caption text-muted-foreground">
                Available to put towards a goal
              </p>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {!goalsView && !goalDetailView ? (
        <BalanceCard

        positionState={savingsOverview.positionState}

        savingsPerformanceState={savingsOverview.performanceState}

        transactionPending={savingsTransactions.pendingTransaction !== null}

        onAddMoney={() => {

          setAddFundsOpen(true);

        }}

        onWithdraw={() => setWithdrawOpen(true)}

        onRefresh={async () => {
          await Promise.all([
            savingsOverview.onRefreshPosition(),
            savingsOverview.onRefreshDashboardData(),
          ]);
        }}

        stagingFaucetAvailable={savingsOverview.stagingFaucet.available}

        stagingFaucetClaiming={savingsOverview.stagingFaucet.claiming}

        stagingFaucetStatus={savingsOverview.stagingFaucet.status}

        stagingFaucetError={savingsOverview.stagingFaucet.error}

        onClaimStagingFaucet={savingsOverview.stagingFaucet.onClaim}

        />
      ) : null}

      {!goalDetailView ? (
      <div
        className={
          goalsView
            ? "space-y-6"
            : "grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.8fr)]"
        }
      >

        <section className="space-y-4" aria-labelledby="goals-heading">

          <div className="flex items-center justify-between gap-4">

            <div>

              <h2
                id="goals-heading"
                className="text-h2 font-semibold tracking-tight"
              >

                {goalsView ? "All goals" : "Goals"}

              </h2>

              <p className="mt-1 text-caption text-muted-foreground">

                {goalsView
                  ? "All of the goals currently guiding your savings."
                  : "What you&apos;re saving towards."}

              </p>

            </div>

            {!goalsView ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCreateGoalOpen(true)}
              >

                <Plus className="size-4" />
                New goal

              </Button>
            ) : null}

          </div>

          {productState.kind === "error" && (

            <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/20 bg-danger-surface px-4 py-3">

              <p className="text-caption text-destructive">

                {productState.message}

              </p>

              <Button variant="ghost" size="sm" onClick={onRefreshProductData}>

                <RefreshCw className="size-4" />
                Retry

              </Button>

            </div>

          )}

          {!goalsView && unassignedSavings !== null && unassignedSavings > 0n && (

            <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-4 py-4 sm:flex-row sm:items-center sm:justify-between">

              <div>

                <p className="text-label font-medium">Unassigned savings</p>

                <p className="mt-1 text-caption text-muted-foreground">

                  Savings that are not assigned to a goal yet.

                </p>

              </div>

              <p className="text-body font-semibold tabular-nums">

                {formatUsdc(unassignedSavings)} USDC

              </p>

            </div>

          )}

          {initialLoading ? (

            <div className="grid gap-4 md:grid-cols-2">

              <Skeleton className="h-72 rounded-lg" />
              <Skeleton className="h-72 rounded-lg" />

            </div>

          ) : activeGoals.length === 0 ? (

            <Card className="border-dashed shadow-none">

              <CardContent className="flex min-h-52 flex-col items-start justify-center gap-4 p-6">

                <div>

                  <h3 className="text-h3 font-semibold">Create your first goal</h3>

                  <p className="mt-1 max-w-lg text-caption text-muted-foreground">

                    Give your savings a destination and track your progress.

                  </p>

                </div>

                <Button onClick={() => setCreateGoalOpen(true)}>

                  <Plus className="size-4" />
                  Create goal

                </Button>

              </CardContent>

            </Card>

          ) : (

            <div className={goalsView ? "grid gap-4 md:grid-cols-2 xl:grid-cols-3" : "grid gap-4 md:grid-cols-2"}>

              {(goalsView ? activeGoals : activeGoals.slice(0, 2)).map((goal) => (

                <GoalCard

                  key={goal.id}

                  goal={goal}

                  funding={

                    goalFundingState.kind === "loading"

                      ? null

                      : (goalFundingState.funding?.byGoal.get(goal.id) ?? null)

                  }

                  onOpen={(selected) => navigate(`/goals/${selected.id}`)}

                />

              ))}

              {(goalsView || activeGoals.length < 2) && (

                <button

                  type="button"

                  onClick={() => setCreateGoalOpen(true)}

                  className="group flex min-h-72 flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border bg-surface p-6 text-center transition-colors hover:border-primary/50 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"

                >

                  <div className="grid size-10 place-items-center rounded-full bg-accent text-accent-foreground">

                    <Plus className="size-4" />

                  </div>

                  <div>

                    <h3 className="text-label font-semibold">
                      {goalsView ? "Start another goal" : "Add another goal"}
                    </h3>

                    <p className="mt-1 text-caption text-muted-foreground">

                      {goalsView
                        ? "Name what you are saving for, choose a target, and keep charting your progress."
                        : "Give more of your savings a purpose."}

                    </p>

                  </div>

                </button>

              )}

            </div>

          )}

        </section>

        {!goalsView ? (
        <section className="space-y-4" aria-labelledby="commitment-heading">

          <div>

            <h2
              id="commitment-heading"
              className="text-h2 font-semibold tracking-tight"
            >

              Commitment

            </h2>

            <p className="mt-1 text-caption text-muted-foreground">

              The habit you&apos;re keeping right now.

            </p>

          </div>

          {featuredCommitment ? (

            <Card className="shadow-none">

              <CardContent className="space-y-4 p-5">

                <CommitmentCard commitment={featuredCommitment} />

                <Button
                  variant="ghost"
                  className="w-full justify-between"
                  disabled
                >

                  View commitment
                  <ArrowRight className="size-4" />

                </Button>

              </CardContent>

            </Card>

          ) : (

            <Card className="border-dashed shadow-none">

              <CardContent className="flex min-h-48 flex-col justify-center p-5">

                <p className="text-label font-medium">No active commitment</p>

                <p className="mt-2 text-caption text-muted-foreground">

                  Add a commitment to one of your goals to build a consistent saving habit.

                </p>

              </CardContent>

            </Card>

          )}

        </section>
        ) : null}

      </div>
      ) : null}

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
    </div>
  );
}
