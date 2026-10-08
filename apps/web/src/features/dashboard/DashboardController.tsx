import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import {
  createPublicClient,
  getAddress,
  http,
  isAddress,
} from "viem";

import {
  createKeptApi,
  readApiBaseUrl,
} from "@/api/kept-api";
import { type Session } from "@/app/providers/session";
import { useKeptEvmWallet } from "@/wallet/evm-wallet";
import { checkNetworkReadiness } from "@/wallet/network-readiness";
import { useKeptTransactionSender } from "@/wallet/transaction-sender";
import { SignOutAction } from "@/features/account/components/SignOutAction";

import { AppShell } from "@/app/layout/AppShell";
import { Skeleton } from "@/components/ui/skeleton";

import {
  useDashboardDataController,
} from "@/features/dashboard/use-dashboard-data-controller";


import { readFiatEnabled } from "@/app/feature-flags";

import { ConsumerError } from "@/lib/consumer-error";

import { diagnostics } from "@/lib/diagnostics";

import { DashboardPage } from "@/features/dashboard/DashboardPage";

import { readCommitmentManagerConfig, readVaultConfig } from "@/wallet/vault/config";

import { getVaultTransactionCoordinator } from "@/lib/transaction-lock";

import {
  useCryptoWithdrawalController,
} from "@/features/withdrawals/use-crypto-withdrawal-controller";

import {
  useSavingsPositionController,
} from "@/features/savings/use-savings-position-controller";

import {
  useSavingsTransactionsController,
} from "@/features/savings/use-savings-transactions-controller";

import {
  useStagingFaucetController,
} from "@/features/savings/use-staging-faucet-controller";

import {
  useRewardStateController,
} from "@/features/commitments/use-reward-state-controller";

import {
  useRewardClaimController,
} from "@/features/commitments/use-reward-claim-controller";

import {
  useGoalDeletionController,
} from "@/features/goals/use-goal-deletion-controller";

import {
  useGoalAllocationController,
} from "@/features/goals/use-goal-allocation-controller";

import {
  useGoalCreationController,
} from "@/features/goals/use-goal-creation-controller";

import {
  useCommitmentCreationController,
} from "@/features/commitments/use-commitment-creation-controller";

import {
  useBankWithdrawalController,
} from "@/features/withdrawals/use-bank-withdrawal-controller";

export function DashboardController({ session }: { readonly session: Session }) {
  const fiatEnabled =
    readFiatEnabled(
      import.meta.env,
    );

  const wallet = useKeptEvmWallet();

  const sender = useKeptTransactionSender(wallet.address);

  const transactionCoordinator = useMemo(
    () => getVaultTransactionCoordinator(),
    [],
  );

  const pendingTransaction = useSyncExternalStore(
    transactionCoordinator.subscribe,

    () => transactionCoordinator.pendingKind,

    () => null,
  );

  const config = useMemo(() => {
    const result = readVaultConfig(import.meta.env);

    if (!result) {
      diagnostics.error(
        "vault.config_invalid",
        new Error("Vault configuration failed validation."),
        {
          rpcUrl: import.meta.env.VITE_MONAD_RPC_URL,
          chainId: import.meta.env.VITE_MONAD_CHAIN_ID,
          vault: import.meta.env.VITE_KEPT_VAULT_ADDRESS,
          usdc: import.meta.env.VITE_MONAD_USDC_ADDRESS,
          localAnvil: import.meta.env.VITE_ENABLE_LOCAL_ANVIL,
        },
      );
    }

    return result;
  }, []);

  const commitmentManagerConfig = useMemo(
    () => readCommitmentManagerConfig(import.meta.env),

    [],
  );

  const apiBaseUrl = useMemo(() => readApiBaseUrl(import.meta.env), []);

  const api = useMemo(
    () =>
      apiBaseUrl
        ? createKeptApi({
          baseUrl: apiBaseUrl,

          getAccessToken:
            session.getAccessToken,
        })
        : null,

    [
      apiBaseUrl,
      session.getAccessToken,
    ],
  );

  const publicClient = useMemo(
    () =>
      config ? createPublicClient({ transport: http(config.rpcUrl) }) : null,

    [config],
  );

  const loadRecentTransactions =
    useCallback(
      async () => {
        if (!api) {
          return [];
        }

        return api.listTransactions();
      },
      [api],
    );

  const readSolanaFundingBalances =
    useCallback(
      async (
        owner: string,
      ) => {
        if (
          !api
        ) {
          throw new Error(
            "Kept API is unavailable.",
          );
        }

        return api
          .getSolanaFundingBalances(
            owner,
          );
      },
      [
        api,
      ],
    );

  const account =
    wallet.address && isAddress(wallet.address)
      ? getAddress(wallet.address)
      : null;

  const productDataReader =
    useMemo(
      () =>
        publicClient
          ? {
              readContract: (input: unknown) =>
                publicClient.readContract(
                  input as never,
                ) as Promise<bigint>,
              multicall: (input: unknown) =>
                publicClient.multicall(
                  input as never,
                ) as Promise<readonly unknown[]>,
            }
          : null,
      [
        publicClient,
      ],
    );

  const savingsPositionReader =
    useMemo(
      () =>
        publicClient
          ? {
              readContract: (input: unknown) =>
                publicClient.readContract(
                  input as never,
                ) as Promise<bigint>,
              getChainId: () =>
                publicClient.getChainId(),
              multicall: (input: unknown) =>
                publicClient.multicall(
                  input as never,
                ) as Promise<readonly unknown[]>,
            }
          : null,
      [
        publicClient,
      ],
    );

  const {
    productState,
    goalFundingState,
    savingsPerformanceState,
    savingsMarketStatusState,
    refreshDashboardData,
  } = useDashboardDataController({
    api,
    enabled:
      account !== null,
    vault:
      config?.vault ?? null,
    publicClient:
      productDataReader,
    chainId:
      config?.chainId ?? null,
  });

  const getCurrentWalletChainId = wallet.getCurrentChainId;

  const {
    positionState,
    refreshPosition,
  } = useSavingsPositionController({
    account,
    liveWalletChainId:
      wallet.liveChainId,
    config,
    publicClient:
      savingsPositionReader,
    getCurrentWalletChainId,
  });

  const {
    available: stagingFaucetAvailable,
    claiming: stagingFaucetClaiming,
    status: stagingFaucetStatus,
    error: stagingFaucetError,
    claim: claimStagingFaucet,
  } = useStagingFaucetController({
    api,
    account,
    chainId:
      config?.chainId ?? null,
    refreshPosition,
  });

  const rewardContractReader =
    useMemo(
      () =>
        publicClient
          ? (input: unknown) =>
              publicClient.readContract(
                input as never,
              )
          : null,
      [
        publicClient,
      ],
    );

  const {
    rewardStates,
    refreshRewardStates,
  } = useRewardStateController({
    manager:
      commitmentManagerConfig?.address
      ?? null,
    commitments:
      productState.kind === "ready"
        ? productState.commitments
        : null,
    readContract:
      rewardContractReader,
  });

  const ensureTransactionNetwork = useCallback(async () => {
    if (!config || !publicClient) {
      throw new ConsumerError(
        "Savings are unavailable because Kept is not configured.",
        {
          code: "service_unavailable",
        },
      );
    }

    const network = await checkNetworkReadiness({
      expectedChainId: config.chainId,

      walletChainId: await getCurrentWalletChainId(),

      rpc: publicClient,
    });

    if (!network.ready) {
      throw new ConsumerError(network.message, {
        code: "wrong_network",

        cause: network.diagnostic,
      });
    }
  }, [config, getCurrentWalletChainId, publicClient]);

  const waitForRewardClaimReceipt =
    useCallback(
      async (transactionHash: `0x${string}`) => {
        if (!publicClient) {
          throw new Error(
            "Savings are unavailable because Kept is not configured.",
          );
        }

        const receipt =
          await publicClient.waitForTransactionReceipt({
            hash:
              transactionHash,
            confirmations:
              import.meta.env.VITE_ENABLE_LOCAL_ANVIL
                === "true"
                ? 1
                : 2,
          });

        return {
          status:
            receipt.status === "success"
              ? "success" as const
              : "reverted" as const,
        };
      },
      [
        publicClient,
      ],
    );

  const {
    claimingRewardId,
    rewardClaimError,
    claimReward,
  } = useRewardClaimController({
    account,
    manager:
      commitmentManagerConfig?.address
      ?? null,
    chainId:
      config?.chainId
      ?? null,
    commitments:
      productState.kind === "ready"
        ? productState.commitments
        : null,
    sender,
    transactionCoordinator,
    ensureTransactionNetwork,
    readContract:
      rewardContractReader,
    waitForReceipt:
      publicClient
        ? waitForRewardClaimReceipt
        : null,
    refreshPosition,
    refreshRewardStates,
  });

  const {
    deletingGoal,
    deleteGoalStatus,
    deleteGoalError,
    deleteGoal,
    dismissGoalDeletion,
  } = useGoalDeletionController({
    api,
    account,
    manager:
      commitmentManagerConfig?.address
      ?? null,
    chainId:
      config?.chainId
      ?? null,
    commitments:
      productState.kind === "ready"
        ? productState.commitments
        : [],
    sender,
    transactionCoordinator,
    ensureTransactionNetwork,
    readContract:
      rewardContractReader,
    waitForReceipt:
      publicClient
        ? waitForRewardClaimReceipt
        : null,
    refreshProductData: refreshDashboardData,
  });

  const goalAllocationReader =
    useMemo(
      () =>
        publicClient
          ? (
              input: unknown,
            ) =>
              publicClient.readContract(
                input as never,
              ) as Promise<bigint>
          : null,
      [
        publicClient,
      ],
    );

  const {
    allocatingGoal,
    allocationStatus,
    allocationError,
    addToGoal,
    removeFromGoal,
    moveBetweenGoals,
    dismissAllocation,
  } = useGoalAllocationController({
    api,
    vault:
      config?.vault
      ?? null,
    goalFundingState,
    readContract:
      goalAllocationReader,
    refreshProductData: refreshDashboardData,
  });

  const {
    creatingGoal,
    goalError,
    createGoal,
    dismissGoal,
  } = useGoalCreationController({
    api,
    refreshProductData: refreshDashboardData,
  });

  const waitForCommitmentReceipt =
    useCallback(
      async (transactionHash: `0x${string}`) => {
        if (!publicClient) {
          throw new Error(
            "Commitments are unavailable because Kept is not configured.",
          );
        }

        const receipt =
          await publicClient.waitForTransactionReceipt({
            hash:
              transactionHash,
            confirmations:
              import.meta.env.VITE_ENABLE_LOCAL_ANVIL
                === "true"
                ? 1
                : 2,
          });

        return {
          status:
            receipt.status === "success"
              ? "success" as const
              : "reverted" as const,
          logs:
            receipt.logs,
        };
      },
      [
        publicClient,
      ],
    );

  const {
    creatingCommitment,
    commitmentStatus,
    commitmentError,
    createCommitment,
    dismissCommitment,
  } = useCommitmentCreationController({
    api,
    account,
    manager:
      commitmentManagerConfig?.address
      ?? null,
    chainId:
      config?.chainId
      ?? null,
    commitments:
      productState.kind === "ready"
        ? productState.commitments
        : null,
    sender,
    transactionCoordinator,
    ensureTransactionNetwork,
    readContract:
      rewardContractReader,
    waitForReceipt:
      publicClient
        ? waitForCommitmentReceipt
        : null,
    refreshProductData: refreshDashboardData,
  });

  const depositQuoteReader =
    useMemo(
      () =>
        publicClient
          ? {
              readContract: (input: unknown) =>
                publicClient.readContract(
                  input as never,
                ),
            }
          : null,
      [
        publicClient,
      ],
    );

  const waitForSavingsTransactionReceipt =
    useCallback(
      async (hash: `0x${string}`) => {
        if (!publicClient) {
          throw new Error(
            "Savings are unavailable because Kept is not configured.",
          );
        }

        const receipt =
          await publicClient.waitForTransactionReceipt({
            hash,
          });

        return {
          status:
            receipt.status === "success"
              ? "success" as const
              : "reverted" as const,
        };
      },
      [
        publicClient,
      ],
    );

  const {
    depositAmount,
    depositStatus,
    depositError,
    depositQuoteState,
    withdrawAmount,
    withdrawStatus,
    withdrawError,
    setDepositAmount,
    setWithdrawAmount,
    submitDeposit,
    submitWithdrawal,
    dismissDeposit,
    dismissWithdrawal,
  } = useSavingsTransactionsController({
    api,
    account,
    config,
    position:
      positionState.kind === "ready"
        ? positionState.position
        : null,
    depositQuoteReader,
    sender,
    transactionCoordinator,
    ensureTransactionNetwork,
    waitForTransactionReceipt:
      publicClient
        ? waitForSavingsTransactionReceipt
        : null,
    refreshPosition,
    refreshDashboardData,
  });

  const {
    amount: cryptoWithdrawAmount,
    recipient: cryptoRecipient,
    destinationAssets: cryptoDestinationAssets,
    destinationAssetId: cryptoDestinationAssetId,
    previewing: cryptoPreviewing,
    previewReady: cryptoPreviewReady,
    previewStatus: cryptoPreviewStatus,
    previewError: cryptoPreviewError,
    executing: cryptoExecuting,
    executionStatus: cryptoExecutionStatus,
    executionError: cryptoExecutionError,
    setAmount: handleCryptoWithdrawAmountChange,
    setRecipient: handleCryptoRecipientChange,
    setDestinationAssetId: handleCryptoDestinationAssetChange,
    preview: previewCryptoTransfer,
    execute: executeCryptoTransfer,
  } = useCryptoWithdrawalController({
    api,
    account,
    config,
    position:
      positionState.kind === "ready"
        ? positionState.position
        : null,
    sender,
    transactionCoordinator,
    ensureTransactionNetwork,
    waitForTransactionReceipt:
      publicClient
        ? waitForSavingsTransactionReceipt
        : null,
    getProvider:
      wallet.getProvider,
    refreshPosition,
    refreshProductData: refreshDashboardData,
  });

  const {
    amount: bankWithdrawAmount,
    submitting: bankWithdrawSubmitting,
    status: bankWithdrawStatus,
    error: bankWithdrawError,
    orderId: bankWithdrawOrderId,
    phase: bankWithdrawPhase,
    reviewAmount: bankWithdrawReviewAmount,
    minimumReceive: bankWithdrawMinimumReceive,
    setAmount: setBankWithdrawAmount,
    start: startBankWithdrawal,
    refresh: refreshBankWithdrawal,
    confirm: confirmBankWithdrawal,
  } = useBankWithdrawalController({
    api,
    fiatEnabled,
    account,
    config,
    position:
      positionState.kind === "ready"
        ? positionState.position
        : null,
    sender,
    transactionCoordinator,
    ensureTransactionNetwork,
    waitForTransactionReceipt:
      publicClient
        ? waitForSavingsTransactionReceipt
        : null,
    getProvider:
      wallet.getProvider,
    refreshPosition,
    refreshProductData: refreshDashboardData,
  });

  const dashboardStartupKey =
    account?.toLowerCase()
    ?? null;

  const positionStartupKey =
    account
    && wallet.liveChainId !== null
      ? `${account.toLowerCase()}:${wallet.liveChainId}`
      : null;

  const loadedDashboardKeyRef =
    useRef<string | null>(
      null,
    );

  const loadedPositionKeyRef =
    useRef<string | null>(
      null,
    );

  useEffect(
    () => {
      if (
        dashboardStartupKey
        === null
      ) {
        loadedDashboardKeyRef.current =
          null;

        return;
      }

      if (
        loadedDashboardKeyRef.current
        === dashboardStartupKey
      ) {
        return;
      }

      loadedDashboardKeyRef.current =
        dashboardStartupKey;

      queueMicrotask(
        () => {
          void refreshDashboardData();
        },
      );
    },
    [
      dashboardStartupKey,
      refreshDashboardData,
    ],
  );

  useEffect(
    () => {
      if (
        positionStartupKey
        === null
      ) {
        loadedPositionKeyRef.current =
          null;

        return;
      }

      if (
        loadedPositionKeyRef.current
        === positionStartupKey
      ) {
        return;
      }

      loadedPositionKeyRef.current =
        positionStartupKey;

      queueMicrotask(
        () => {
          void refreshPosition();
        },
      );
    },
    [
      positionStartupKey,
      refreshPosition,
    ],
  );

  if (!session.isReady) {
    return (
      <AppShell>
        <div
          className="space-y-8"
          aria-live="polite"
          aria-label="Preparing your Kept account"
        >
          <div className="space-y-3">
            <Skeleton className="h-10 w-40 rounded-md" />
            <Skeleton className="h-5 w-72 max-w-full rounded-md" />
          </div>

          <Skeleton className="h-56 w-full rounded-xl" />

          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-36 rounded-lg" />
            <Skeleton className="h-36 rounded-lg" />
            <Skeleton className="h-36 rounded-lg" />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.8fr)]">
            <Skeleton className="h-64 rounded-lg" />
            <Skeleton className="h-64 rounded-lg" />
          </div>

          <span className="sr-only">
            Preparing your account…
          </span>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      headerAction={
        wallet.address ? (
          <SignOutAction
onSignOut={async () => {
              session.logout();
            }}
          />
        ) : undefined
      }
    >
      <DashboardPage
        walletAddress={wallet.address}

        loadRecentTransactions={
          loadRecentTransactions
        }

        readSolanaFundingBalances={
          readSolanaFundingBalances
        }

        savingsOverview={{
          positionState,

          performanceState:
            savingsPerformanceState,

          marketStatusState:
            savingsMarketStatusState,

          onRefreshPosition:
            refreshPosition,

          onRefreshDashboardData:
            refreshDashboardData,

          stagingFaucet: {
            available:
              stagingFaucetAvailable,

            claiming:
              stagingFaucetClaiming,

            status:
              stagingFaucetStatus,

            error:
              stagingFaucetError,

            onClaim: () =>
              void claimStagingFaucet(),
          },
        }}

        goalFundingState={goalFundingState}

        productState={productState}

        savingsTransactions={{
          deposit: {
            amount:
              depositAmount,

            status:
              depositStatus,

            error:
              depositError,

            quoteState:
              depositQuoteState,

            onAmountChange:
              setDepositAmount,

            onSubmit:
              submitDeposit,

            onDismiss:
              dismissDeposit,
          },

          withdrawal: {
            amount:
              withdrawAmount,

            status:
              withdrawStatus,

            error:
              withdrawError,

            onAmountChange:
              setWithdrawAmount,

            onSubmit:
              submitWithdrawal,

            onDismiss:
              dismissWithdrawal,
          },

          pendingTransaction,
        }}

        goalManagement={{
          creation: {
            creating:
              creatingGoal,

            error:
              goalError,

            onCreate:
              createGoal,

            onDismiss:
              dismissGoal,
          },

          deletion: {
            deleting:
              deletingGoal,

            status:
              deleteGoalStatus,

            error:
              deleteGoalError,

            onDelete:
              deleteGoal,

            onDismiss:
              dismissGoalDeletion,
          },

          allocation: {
            allocating:
              allocatingGoal,

            status:
              allocationStatus,

            error:
              allocationError,

            onAdd:
              addToGoal,

            onRemove:
              removeFromGoal,

            onMove:
              moveBetweenGoals,

            onDismiss:
              dismissAllocation,
          },

          commitment: {
            creating:
              creatingCommitment,

            status:
              commitmentStatus,

            error:
              commitmentError,

            onCreate:
              createCommitment,

            onDismiss:
              dismissCommitment,
          },

          rewards: {
            states:
              rewardStates,

            claimingId:
              claimingRewardId,

            claimError:
              rewardClaimError,

            onClaim:
              claimReward,
          },
        }}

        onRefreshProductData={refreshDashboardData}

        cryptoWithdrawal={{
          amount:
            cryptoWithdrawAmount,

          recipient:
            cryptoRecipient,

          destinationAssets:
            cryptoDestinationAssets,

          destinationAssetId:
            cryptoDestinationAssetId,

          previewing:
            cryptoPreviewing,

          previewReady:
            cryptoPreviewReady,

          previewStatus:
            cryptoPreviewStatus,

          previewError:
            cryptoPreviewError,

          executing:
            cryptoExecuting,

          executionStatus:
            cryptoExecutionStatus,

          executionError:
            cryptoExecutionError,

          estimatedReceive:
            null,

          onAmountChange:
            handleCryptoWithdrawAmountChange,

          onRecipientChange:
            handleCryptoRecipientChange,

          onDestinationAssetChange:
            handleCryptoDestinationAssetChange,

          onPreview: () =>
            void previewCryptoTransfer(),

          onExecute: () =>
            void executeCryptoTransfer(),
        }}

        bankWithdrawal={{
          amount:
            bankWithdrawAmount,

          submitting:
            bankWithdrawSubmitting,

          status:
            bankWithdrawStatus,

          error:
            bankWithdrawError,

          orderId:
            bankWithdrawOrderId,

          phase:
            bankWithdrawPhase,

          reviewAmount:
            bankWithdrawReviewAmount,

          minimumReceive:
            bankWithdrawMinimumReceive,

          onAmountChange:
            setBankWithdrawAmount,

          onStart: () =>
            void startBankWithdrawal(),

          onRefresh: () =>
            void refreshBankWithdrawal(),

          onConfirm: () =>
            void confirmBankWithdrawal(),
        }}
      />
    </AppShell>
  );
}
