import {
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { useNavigate } from "react-router-dom";
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
import { type Session } from "@/auth/session";
import { useKeptEvmWallet } from "@/chain/evm-wallet";
import { checkNetworkReadiness } from "@/chain/network-readiness";
import { useKeptTransactionSender } from "@/chain/transaction-sender";
import { AccountMenu } from "@/features/account/components/AccountMenu";

import { AppShell } from "@/app/layout/AppShell";

import {
  useProductDataController,
} from "@/features/dashboard/use-product-data-controller";

import {
  useSavingsStatusController,
} from "@/features/savings/use-savings-status-controller";


import { readFiatEnabled } from "@/config/feature-flags";

import { ConsumerError } from "@/lib/consumer-error";

import { diagnostics } from "@/lib/diagnostics";

import { DashboardPage } from "@/features/dashboard/DashboardPage";

import { readCommitmentManagerConfig, readVaultConfig } from "@/vault/config";

import { getVaultTransactionCoordinator } from "@/vault/transaction-lock";

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
} from "@/features/dashboard/use-staging-faucet-controller";

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

export function DashboardApp({ session }: { readonly session: Session }) {
  const navigate = useNavigate();

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

          getAccessToken: session.getAccessToken,
        })
        : null,

    [apiBaseUrl, session.getAccessToken],
  );

  const publicClient = useMemo(
    () =>
      config ? createPublicClient({ transport: http(config.rpcUrl) }) : null,

    [config],
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

  const {
    productState,
    goalFundingState,
    refreshProductData,
  } = useProductDataController({
    api,
    account,
    vault:
      config?.vault ?? null,
    publicClient:
      publicClient
        ? {
            readContract: (input) =>
              publicClient.readContract(
                input as never,
              ) as Promise<bigint>,
          }
        : null,
  });

  const {
    savingsPerformanceState,
    savingsMarketStatusState,
    refreshSavingsPerformance,
    refreshSavingsMarketStatus,
  } = useSavingsStatusController({
    api,
    account,
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
      publicClient
        ? {
            readContract: (input) =>
              publicClient.readContract(
                input as never,
              ) as Promise<bigint>,
            getChainId: () =>
              publicClient.getChainId(),
          }
        : null,
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
    refreshProductData,
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
    refreshProductData,
  });

  const {
    creatingGoal,
    goalError,
    createGoal,
    dismissGoal,
  } = useGoalCreationController({
    api,
    refreshProductData,
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
    refreshProductData,
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
    refreshProductData,
    refreshSavingsPerformance,
    refreshSavingsMarketStatus,
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
    refreshProductData,
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
    refreshProductData,
  });

  useEffect(() => {
    queueMicrotask(() => {
      void refreshPosition();
    });
  }, [
    refreshPosition,
  ]);

  useEffect(() => {
    queueMicrotask(() => {
      void refreshProductData();

      void refreshSavingsPerformance();

      void refreshSavingsMarketStatus();
    });
  }, [
    refreshProductData,
    refreshSavingsPerformance,
    refreshSavingsMarketStatus,
  ]);

  if (!session.isReady) {
    return (
      <main
        className="grid min-h-screen place-items-center text-sm text-muted-foreground"
        aria-live="polite"
      >
        Preparing your account…
      </main>
    );
  }

  return (
    <AppShell
      headerAction={
        wallet.address ? (
          <AccountMenu
            onOpenAccount={() => {
              navigate("/account");
            }}
            onSignOut={async () => {
              session.logout();
            }}
          />
        ) : undefined
      }
    >
      <DashboardPage
        walletAddress={wallet.address}

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

          onRefreshPerformance:
            refreshSavingsPerformance,

          onRefreshMarketStatus:
            refreshSavingsMarketStatus,

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

        onRefreshProductData={refreshProductData}

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
