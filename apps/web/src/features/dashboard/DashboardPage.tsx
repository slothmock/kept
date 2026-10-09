import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Plus, RefreshCw, SlidersHorizontal } from "lucide-react";
import type { CommitmentDto, GoalDto, TransactionDto } from "@/api/kept-api";
import type { AccessTokenProvider } from "@/api/http-client";
import { Button } from "@/components/ui/button";

import { Card, CardContent } from "@/components/ui/card";

import { Skeleton } from "@/components/ui/skeleton";

import type { ProductDataState } from "@/features/dashboard/product-data-state";
import { HomeActivityPreview } from "@/features/dashboard/HomeActivityPreview";

import { CommitmentCard } from "@/features/commitments/components/CommitmentCard";

import { CommitmentsView } from "@/features/commitments/CommitmentsView";

import { CommitmentDetailView } from "@/features/commitments/CommitmentDetailView";

import {

  CreateCommitmentDialog,

  type CreateCommitmentInput,

} from "@/features/commitments/components/CreateCommitmentDialog";

import { AddMoneyView } from "@/features/funding/AddMoneyView";

import { updateDialogOpenState } from "@/features/dashboard/dialog-lifecycle";

import { ManageGoalSavingsDialog } from "@/features/goals/components/ManageGoalSavingsDialog";

import { CreateGoalDialog } from "@/features/goals/components/CreateGoalDialog";

import { GoalCard } from "@/features/goals/components/GoalCard";

import { GoalDetailView } from "@/features/goals/components/GoalDetailView";

import type { GoalFundingState } from "@/features/goals/funding";

import {
  BalanceCard,
} from "@/features/savings/components/BalanceCard";

import type {
  PositionState,
  SavingsMarketStatusState,
  SavingsPerformanceState,
} from "@/features/savings/state";

import { DepositDialog } from "@/features/savings/components/DepositDialog";
import { WithdrawSavingsDialog } from "@/features/savings/components/WithdrawSavingsDialog";

import type { DepositQuoteState } from "@/features/savings/deposit-quote";

import { WithdrawView } from "@/features/withdrawals/WithdrawView";

import type { RewardState } from "@/features/commitments/reward-claim";

import { formatUsdc } from "@/features/savings/format";

import { readFiatEnabled } from "@/app/feature-flags";

import type { FundingAsset } from "@/features/funding/intents/supported-tokens";

interface DashboardPageProps {

  readonly walletAddress: string | null;

  readonly getAccessToken:
    AccessTokenProvider;

  readonly loadRecentTransactions:
    () => Promise<readonly TransactionDto[]>;

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

    readonly cancellation: {
      readonly cancellingId:
      string | null;

      readonly status:
      string | null;

      readonly error:
      string | null;

      readonly onCancel: (
        commitment: CommitmentDto,
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
      () => Promise<void>;

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

function DetailPageSkeleton() {
  return (
    <div className="space-y-8" aria-label="Loading details" aria-live="polite">
      <div className="space-y-4">
        <Skeleton className="h-8 w-36 rounded-md" />
        <Skeleton className="h-10 w-64 max-w-full rounded-md" />
        <Skeleton className="h-5 w-40 rounded-md" />
      </div>

      <Skeleton className="h-40 w-full rounded-xl" />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.75fr)]">
        <div className="space-y-4">
          <Skeleton className="h-7 w-48 rounded-md" />
          <Skeleton className="h-72 rounded-lg" />
        </div>

        <div className="space-y-4">
          <Skeleton className="h-44 rounded-lg" />
          <Skeleton className="h-44 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

function CommitmentsPageSkeleton() {
  return (
    <div className="space-y-8" aria-label="Loading commitments" aria-live="polite">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-10 w-48 rounded-md" />
        <Skeleton className="h-10 w-36 rounded-md" />
      </div>

      <Skeleton className="h-11 w-48 rounded-lg" />

      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>

      <div className="space-y-4">
        <Skeleton className="h-7 w-52 rounded-md" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
      </div>
    </div>
  );
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

  const { goalId, commitmentId } = useParams<{ goalId?: string; commitmentId?: string }>();

  const homeView = location.pathname === "/dashboard";

  const goalDetailView = location.pathname.startsWith("/goals/");

  const goalsView = location.pathname === "/goals";

  const commitmentDetailView = location.pathname.startsWith("/commitments/");

  const commitmentsView = location.pathname === "/commitments";

  const addMoneyView = location.pathname === "/add-money";

  const withdrawView = location.pathname === "/withdraw";

  const fiatEnabled =
    readFiatEnabled(
      import.meta.env,
    );

  const {

    walletAddress,

    getAccessToken,

    loadRecentTransactions,

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

  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawSavingsOpen, setWithdrawSavingsOpen] = useState(false);
  const [activityRevision, setActivityRevision] = useState(0);

  const [createGoalOpen, setCreateGoalOpen] = useState(false);

  const [commitmentGoal, setCommitmentGoal] = useState<GoalDto | null>(null);

  const [savingsGoal, setSavingsGoal] = useState<GoalDto | null>(null);


  const goals = productState.goals;

  const commitments = productState.commitments;

  const activeGoals = goals.filter((goal) => goal.status === "ACTIVE");

  const sortedActiveGoals = [...activeGoals].sort((left, right) => {
    const leftDate = left.targetDate
      ? new Date(left.targetDate).getTime()
      : Number.POSITIVE_INFINITY;
    const rightDate = right.targetDate
      ? new Date(right.targetDate).getTime()
      : Number.POSITIVE_INFINITY;

    return leftDate - rightDate;
  });

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

  const selectedCommitment =
    commitmentDetailView && commitmentId
      ? commitments.find((commitment) => commitment.id === commitmentId) ?? null
      : null;

  const selectedCommitmentGoal =
    selectedCommitment
      ? goals.find((goal) => goal.id === selectedCommitment.savingsGoalId) ?? null
      : null;

  const initialLoading = productState.kind === "loading" && goals.length === 0;

  const activeCommitments = commitments.filter(
    (commitment) => commitment.state === "ACTIVE",
  );

  const featuredCommitment = activeCommitments[0] ?? null;


  const commitmentForDialog = commitmentGoal

    ? currentCommitment(commitmentGoal.id, commitments)

    : undefined;

  const currentCommitmentsForDialog =
    commitmentGoal
      ? commitments.filter(
        (commitment) =>
          commitment.savingsGoalId === commitmentGoal.id
          && (
            commitment.state === "DRAFT"
            || commitment.state === "ACTIVE"
          ),
      )
      : [];

  const allocatedGoalSavings =
    goalFundingState.kind === "ready"
      ? goalFundingState.funding.totalAllocatedAssets
      : null;

  return (

    <div className="space-y-8">

      {addMoneyView ? (
        <AddMoneyView
          walletAddress={walletAddress}
          getAccessToken={getAccessToken}
          fiatEnabled={fiatEnabled}
          readSolanaFundingBalances={readSolanaFundingBalances}
          onBack={() => navigate("/dashboard")}
        />
      ) : null}

      {withdrawView ? (
        <WithdrawView
          position={
            savingsOverview.positionState.kind === "ready"
              ? savingsOverview.positionState.position
              : null
          }
          positionLoading={savingsOverview.positionState.kind === "loading"}
          cryptoAvailable={cryptoWithdrawal.destinationAssets.length > 0}
          cryptoAmount={cryptoWithdrawal.amount}
          cryptoRecipient={cryptoWithdrawal.recipient}
          cryptoDestinationAssets={cryptoWithdrawal.destinationAssets}
          cryptoDestinationAssetId={cryptoWithdrawal.destinationAssetId}
          cryptoPreviewing={cryptoWithdrawal.previewing}
          cryptoPreviewReady={cryptoWithdrawal.previewReady}
          cryptoPreviewStatus={cryptoWithdrawal.previewStatus}
          cryptoPreviewError={cryptoWithdrawal.previewError}
          cryptoExecuting={cryptoWithdrawal.executing}
          cryptoExecutionStatus={cryptoWithdrawal.executionStatus}
          cryptoExecutionError={cryptoWithdrawal.executionError}
          cryptoEstimatedReceive={cryptoWithdrawal.estimatedReceive}
          onBack={() => navigate("/dashboard")}
          onCryptoAmountChange={cryptoWithdrawal.onAmountChange}
          onCryptoRecipientChange={cryptoWithdrawal.onRecipientChange}
          onCryptoDestinationAssetChange={cryptoWithdrawal.onDestinationAssetChange}
          onPreviewCryptoWithdrawal={cryptoWithdrawal.onPreview}
          onExecuteCryptoWithdrawal={cryptoWithdrawal.onExecute}
          bankAvailable={true}
          bankEnabled={fiatEnabled}
          bankAmount={bankWithdrawal.amount}
          bankSubmitting={bankWithdrawal.submitting}
          bankStatus={bankWithdrawal.status}
          bankError={bankWithdrawal.error}
          bankPhase={bankWithdrawal.phase}
          bankReviewAmount={bankWithdrawal.reviewAmount}
          bankMinimumReceive={bankWithdrawal.minimumReceive}
          onBankAmountChange={bankWithdrawal.onAmountChange}
          onStartBankWithdrawal={bankWithdrawal.onStart}
          onRefreshBankWithdrawal={bankWithdrawal.onRefresh}
          onConfirmBankWithdrawal={bankWithdrawal.onConfirm}
        />
      ) : null}

      {commitmentDetailView ? (
        selectedCommitment ? (
          <CommitmentDetailView
            commitment={selectedCommitment}
            goal={selectedCommitmentGoal}
            rewardState={goalManagement.rewards.states[selectedCommitment.id]}
            claiming={goalManagement.rewards.claimingId === selectedCommitment.id}
            claimError={
              goalManagement.rewards.claimError?.commitmentId === selectedCommitment.id
                ? goalManagement.rewards.claimError.message
                : null
            }
            onBack={() => navigate("/commitments")}
            onOpenGoal={(goal) => navigate(`/goals/${goal.id}`)}
            onClaimReward={goalManagement.rewards.onClaim}
            cancelling={
              goalManagement.cancellation.cancellingId === selectedCommitment.id
            }
            cancelStatus={goalManagement.cancellation.status}
            cancelError={goalManagement.cancellation.error}
            onCancel={goalManagement.cancellation.onCancel}
            onDismissCancel={goalManagement.cancellation.onDismiss}
            onAddToSavings={() => setDepositOpen(true)}
          />
        ) : productState.kind === "loading" ? (
          <DetailPageSkeleton />
        ) : (
          <Card className="border-dashed shadow-none">
            <CardContent className="p-6">
              <p className="text-label font-medium">Commitment not found</p>
              <p className="mt-2 text-caption text-muted-foreground">
                This commitment may no longer be available.
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => navigate("/commitments")}
              >
                Back to commitments
              </Button>
            </CardContent>
          </Card>
        )
      ) : null}

      {commitmentsView ? (
        initialLoading ? (
          <CommitmentsPageSkeleton />
        ) : (
          <CommitmentsView
            commitments={commitments}
            goals={goals}
            onAddCommitment={(goal) => setCommitmentGoal(goal)}
            onOpenGoal={(goal) => navigate(`/goals/${goal.id}`)}
            onOpenCommitment={(commitment) =>
              navigate(`/commitments/${commitment.id}`)
            }
          />
        )
      ) : null}


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
            currentApyBps={
              savingsOverview.marketStatusState.kind === "ready"
                ? savingsOverview.marketStatusState.netApyBps
                : null
            }
            loadRecentTransactions={loadRecentTransactions}
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
          <DetailPageSkeleton />
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


      {homeView ? (
        <>
          <section className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-h1 font-semibold tracking-tight">
              Home
            </h1>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => navigate("/add-money")}>
                <Plus className="size-4" />
                Add money
              </Button>

              <Button
                variant="outline"
                onClick={() => navigate("/withdraw")}
              >
                Withdraw
              </Button>
            </div>
          </section>

          <BalanceCard
            positionState={savingsOverview.positionState}
            savingsPerformanceState={savingsOverview.performanceState}
            marketStatusState={savingsOverview.marketStatusState}
            demoYield={import.meta.env.VITE_MONAD_CHAIN_ID === "10143"}
            allocatedGoalSavings={allocatedGoalSavings}
            showActions={false}
            transactionPending={savingsTransactions.pendingTransaction !== null}
            onAddMoney={() => navigate("/add-money")}
            onWithdraw={() => setWithdrawSavingsOpen(true)}
            onAddToSavings={() => setDepositOpen(true)}
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
            onClaimStagingFaucet={() => {
              void savingsOverview.stagingFaucet.onClaim().finally(() => {
                setActivityRevision((current) => current + 1);
              });
            }}
          />

          <section className="space-y-4" aria-labelledby="home-goals-heading">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2
                  id="home-goals-heading"
                  className="text-h3 font-semibold tracking-tight"
                >
                  Your goals
                </h2>

                <p className="mt-1 text-caption text-muted-foreground">
                  {initialLoading
                    ? "Loading goals…"
                    : allocatedGoalSavings === null
                      ? `${activeGoals.length} active ${activeGoals.length === 1 ? "goal" : "goals"}`
                      : `${formatUsdc(allocatedGoalSavings)} USDC saved across ${activeGoals.length} ${activeGoals.length === 1 ? "goal" : "goals"}`}
                </p>
              </div>

              <Button
                variant="secondary"
                size="sm"
                className="bg-surface text-foreground hover:bg-accent"
                onClick={() => navigate("/goals")}
              >
                View all goals
              </Button>
            </div>

            {productState.kind === "error" ? (
              <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/20 bg-danger-surface px-4 py-3">
                <p className="text-caption text-destructive">
                  {productState.message}
                </p>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRefreshProductData}
                >
                  <RefreshCw className="size-4" />
                  Retry
                </Button>
              </div>
            ) : initialLoading ? (
              <div className="grid gap-4 lg:grid-cols-3">
                <Skeleton className="h-36 rounded-lg" />
                <Skeleton className="h-36 rounded-lg" />
                <Skeleton className="h-36 rounded-lg" />
              </div>
            ) : (
              <div
                className={
                  activeGoals.length === 1
                    ? "grid gap-4 lg:grid-cols-2"
                    : "grid gap-4 lg:grid-cols-3"
                }
              >
                {activeGoals.slice(0, 3).map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    compact
                    funding={
                      goalFundingState.kind === "loading"
                        ? null
                        : (goalFundingState.funding?.byGoal.get(goal.id) ?? null)
                    }
                    onOpen={(selected) =>
                      navigate(`/goals/${selected.id}`)
                    }
                  />
                ))}

                {activeGoals.length <= 2 ? (
                  <button
                    type="button"
                    onClick={() => setCreateGoalOpen(true)}
                    className="group flex min-h-36 flex-col items-start justify-center rounded-lg border border-dashed border-border bg-surface p-5 text-left transition-colors hover:border-primary/50 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <div className="grid size-10 place-items-center rounded-full bg-accent text-accent-foreground">
                      <Plus className="size-4" />
                    </div>

                    <h3 className="mt-4 text-label font-medium">
                      Create a goal
                    </h3>

                    <p className="mt-1 text-caption text-muted-foreground">
                      Start saving toward something new.
                    </p>
                  </button>
                ) : null}
              </div>
            )}
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.8fr)]">
            <section className="space-y-4" aria-labelledby="home-commitment-heading">
              <div className="flex items-end justify-between gap-4">
                <h2
                  id="home-commitment-heading"
                  className="text-h3 font-semibold tracking-tight"
                >
                  Active commitment
                </h2>

                <Button
                  variant="secondary"
                  size="sm"
                  className="bg-surface text-foreground hover:bg-accent"
                  onClick={() => navigate("/commitments")}
                >
                  View commitments
                </Button>
              </div>

              {initialLoading ? (
                <Skeleton className="h-32 rounded-lg" />
              ) : featuredCommitment ? (
                <Card className="shadow-none">
                  <CardContent className="p-5">
                    <CommitmentCard
                      commitment={featuredCommitment}
                      compact
                    />

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                      <p className="text-caption text-muted-foreground">
                        Due {new Date(featuredCommitment.epochEnd).toLocaleDateString()}
                      </p>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          navigate(`/commitments/${featuredCommitment.id}`)
                        }
                      >
                        View commitment
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-dashed shadow-none">
                  <CardContent className="flex min-h-32 flex-col justify-center p-5">
                    <p className="text-label font-medium">
                      No active commitment
                    </p>
                    <p className="mt-1 text-caption text-muted-foreground">
                      Add a commitment to a goal when you are ready to build a regular saving habit.
                    </p>
                  </CardContent>
                </Card>
              )}
            </section>

            <section className="space-y-4" aria-labelledby="home-activity-heading">
              <div className="flex items-end justify-between gap-4">
                <h2
                  id="home-activity-heading"
                  className="text-h3 font-semibold tracking-tight"
                >
                  Recent activity
                </h2>

                <Button
                  variant="secondary"
                  size="sm"
                  className="bg-surface text-foreground hover:bg-accent"
                  onClick={() => navigate("/activity")}
                >
                  See all
                </Button>
              </div>

              <HomeActivityPreview
                key={activityRevision}
                loadTransactions={loadRecentTransactions}
              />
            </section>
          </div>
        </>
      ) : null}

      {goalsView ? (
        <>
          <section className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-h1 font-semibold tracking-tight">
              Goals
            </h1>

            <Button onClick={() => setCreateGoalOpen(true)}>
              <Plus className="size-4" />
              Create a goal
            </Button>
          </section>

          <section
            className="grid gap-4 sm:grid-cols-3"
            aria-label="Goals summary"
          >
            <Card className="shadow-none">
              <CardContent className="p-6">
                <p className="text-caption font-medium text-muted-foreground">
                  Saved toward goals
                </p>

                <p className="mt-2 text-h2 font-semibold tabular-nums">
                  {allocatedGoalSavings === null
                    ? "—"
                    : `${formatUsdc(allocatedGoalSavings)} USDC`}
                </p>

                <p className="mt-1 text-caption text-muted-foreground">
                  {initialLoading
                    ? "Loading goals…"
                    : `Across ${activeGoals.length} active ${activeGoals.length === 1 ? "goal" : "goals"}`}
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-none">
              <CardContent className="p-6">
                <p className="text-caption font-medium text-muted-foreground">
                  Active goals
                </p>

                <p className="mt-2 text-h2 font-semibold tabular-nums">
                  {initialLoading ? "—" : activeGoals.length}
                </p>

                <p className="mt-1 text-caption text-muted-foreground">
                  Currently in progress
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-none">
              <CardContent className="p-6">
                <p className="text-caption font-medium text-muted-foreground">
                  {import.meta.env.VITE_MONAD_CHAIN_ID === "10143" ? "Demo APY" : "Current APY"}
                </p>

                <p className="mt-2 text-h2 font-semibold tabular-nums">
                  {savingsOverview.marketStatusState.kind === "ready"
                    ? `${(savingsOverview.marketStatusState.netApyBps / 100).toFixed(2)}%`
                    : "—"}
                </p>

                <p className="mt-1 text-caption text-muted-foreground">
                  {import.meta.env.VITE_MONAD_CHAIN_ID === "10143"
                    ? "Simulated testnet yield, after Kept's fee"
                    : "Variable, after Kept's fee"}
                </p>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4" aria-labelledby="goals-heading">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2
                  id="goals-heading"
                  className="text-h3 font-semibold tracking-tight"
                >
                  Active goals
                </h2>

                <p className="mt-1 text-caption text-muted-foreground">
                  {initialLoading
                    ? "Loading goals…"
                    : `${activeGoals.length} ${activeGoals.length === 1 ? "goal" : "goals"} currently growing`}
                </p>
              </div>

              <div
                className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-label text-foreground"
                aria-label="Goals sorted by soonest target date"
              >
                <SlidersHorizontal className="size-4 text-muted-foreground" />
                Sort: Soonest
              </div>
            </div>

            {productState.kind === "error" ? (
              <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/20 bg-danger-surface px-4 py-3">
                <p className="text-caption text-destructive">
                  {productState.message}
                </p>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRefreshProductData}
                >
                  <RefreshCw className="size-4" />
                  Retry
                </Button>
              </div>
            ) : initialLoading ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <Skeleton className="h-36 rounded-lg" />
                <Skeleton className="h-36 rounded-lg" />
                <Skeleton className="h-36 rounded-lg" />
                <Skeleton className="h-36 rounded-lg" />
              </div>
            ) : activeGoals.length === 0 ? (
              <Card className="border-dashed shadow-none">
                <CardContent className="flex min-h-40 items-center justify-between gap-4 p-6">
                  <div>
                    <h3 className="text-label font-semibold">
                      Create your first goal
                    </h3>

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
              <div className="grid gap-4 lg:grid-cols-2">
                {sortedActiveGoals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    compact
                    funding={
                      goalFundingState.kind === "loading"
                        ? null
                        : (goalFundingState.funding?.byGoal.get(goal.id) ?? null)
                    }
                    onOpen={(selected) =>
                      navigate(`/goals/${selected.id}`)
                    }
                  />
                ))}

                <button
                  type="button"
                  onClick={() => setCreateGoalOpen(true)}
                  className="group flex min-h-36 flex-col items-start justify-center rounded-lg border border-border bg-surface p-5 text-left transition-colors hover:border-primary/50 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <div className="grid size-10 place-items-center rounded-full bg-accent text-accent-foreground">
                    <Plus className="size-4" />
                  </div>

                  <h3 className="mt-4 text-label font-medium">
                    Start another goal
                  </h3>

                  <p className="mt-4 max-w-md text-caption text-muted-foreground">
                    Name what you are saving for, choose a target, and keep charting your progress.
                  </p>

                  <span className="mt-4 rounded-md border border-border px-3 py-2 text-label font-medium">
                    Create goal
                  </span>
                </button>
              </div>
            )}
          </section>
        </>
      ) : null}

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

      <WithdrawSavingsDialog
        open={withdrawSavingsOpen}
        amount={savingsTransactions.withdrawal.amount}
        status={savingsTransactions.withdrawal.status}
        error={savingsTransactions.withdrawal.error}
        availableBalance={
          savingsOverview.positionState.kind === "ready"
            ? savingsOverview.positionState.position.withdrawableAssets
            : null
        }
        ready={savingsOverview.positionState.kind === "ready" && Boolean(walletAddress)}
        submitting={savingsTransactions.pendingTransaction === "withdraw"}
        onOpenChange={(open) =>
          updateDialogOpenState(open, setWithdrawSavingsOpen, savingsTransactions.withdrawal.onDismiss)
        }
        onAmountChange={savingsTransactions.withdrawal.onAmountChange}
        onSubmit={() => {
          void (async () => {
            const succeeded = await savingsTransactions.withdrawal.onSubmit();
            if (succeeded) {
              setWithdrawSavingsOpen(false);
            }
          })();
        }}
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
        currentCommitments={currentCommitmentsForDialog}
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
