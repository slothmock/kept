import {
  useCallback,
  useEffect,
  useMemo,
  useState,
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
import { AccountMenu } from "@/components/AccountMenu";

import { AppShell } from "@/components/AppShell";

import {
  useProductDataController,
} from "@/features/dashboard/use-product-data-controller";

import {
  useSavingsStatusController,
} from "@/features/dashboard/use-savings-status-controller";

import { formatUsdc } from "@/features/savings/format";

import { ConsumerError, consumerErrorMessage } from "@/lib/consumer-error";

import { readFiatEnabled } from "@/config/feature-flags";

import { diagnostics } from "@/lib/diagnostics";

import { DashboardPage } from "@/pages/DashboardPage";

import { readCommitmentManagerConfig, readVaultConfig } from "@/vault/config";

import {
  parseUsdcDepositAmount,
} from "@/vault/deposit-input";

import { submitVaultWithdrawal } from "@/vault/executor";

import { getVaultTransactionCoordinator } from "@/vault/transaction-lock";

import {
  buildVaultWithdrawTransaction,
} from "@/vault/transactions";

import {
  createKeptIntentsRunner,
} from "@/features/funding/intents/runner";

import { executeCryptoWithdrawal } from "./features/withdrawal/execute-withdrawal";
import {
  deliverBankWithdrawal,
  type BankWithdrawalPhase,
} from "./features/withdrawal/bank-withdrawal-lifecycle";

import {
  useBankWithdrawalOrderController,
} from "@/features/dashboard/use-bank-withdrawal-order-controller";

import {
  useCryptoWithdrawalController,
} from "@/features/dashboard/use-crypto-withdrawal-controller";

import {
  useSavingsPositionController,
} from "@/features/dashboard/use-savings-position-controller";

import {
  useSavingsTransactionsController,
} from "@/features/dashboard/use-savings-transactions-controller";

import {
  useStagingFaucetController,
} from "@/features/dashboard/use-staging-faucet-controller";

import {
  useRewardStateController,
} from "@/features/dashboard/use-reward-state-controller";

import {
  useRewardClaimController,
} from "@/features/dashboard/use-reward-claim-controller";

import {
  useGoalDeletionController,
} from "@/features/dashboard/use-goal-deletion-controller";

import {
  useGoalAllocationController,
} from "@/features/dashboard/use-goal-allocation-controller";

import {
  useGoalCreationController,
} from "@/features/dashboard/use-goal-creation-controller";

import {
  useCommitmentCreationController,
} from "@/features/dashboard/use-commitment-creation-controller";

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

  const [
    bankWithdrawAmount,
    setBankWithdrawAmount,
  ] = useState("");

  const [
    bankWithdrawSubmitting,
    setBankWithdrawSubmitting,
  ] = useState(false);

  const [
    bankActionStatus,
    setBankWithdrawStatus,
  ] = useState<string | null>(null);

  const [
    bankActionError,
    setBankWithdrawError,
  ] = useState<string | null>(null);

  const [
    bankActionPhase,
    setBankWithdrawPhase,
  ] = useState<BankWithdrawalPhase>("setup");

  const [
    bankActionActive,
    setBankActionActive,
  ] = useState(false);

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
        : [],
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

  const bankWithdrawal =
    useBankWithdrawalOrderController({
      api,
      fiatEnabled,
      account,
      ensureTransactionNetwork,
      getProvider:
        wallet.getProvider,
    });

  const bankWithdrawStatus =
    bankActionActive
      ? bankActionStatus
      : bankWithdrawal.status;

  const bankWithdrawError =
    bankActionActive
      ? bankActionError
      : bankWithdrawal.error;

  const bankWithdrawPhase =
    bankActionActive
      ? bankActionPhase
      : bankWithdrawal.phase;

  useEffect(() => {
    if (
      bankActionActive
      && bankActionPhase === "processing"
      && bankWithdrawal.phase !== "processing"
    ) {
      queueMicrotask(() => {
        setBankActionActive(false);
      });
    }
  }, [
    bankActionActive,
    bankActionPhase,
    bankWithdrawal.phase,
  ]);

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

  const startBankWithdrawal =
    useCallback(
      async () => {
        setBankActionActive(true);
        if (!fiatEnabled) {
          setBankWithdrawError(
            "Bank withdrawals are coming soon.",
          );
          return;
        }

        if (!api || positionState.kind !== "ready") {
          setBankWithdrawError(
            "Your Kept account is not ready yet.",
          );
          return;
        }

        const parsed = parseUsdcDepositAmount(bankWithdrawAmount);
        if ("error" in parsed || parsed.assets <= 0n) {
          setBankWithdrawError("Enter a valid amount.");
          return;
        }

        const available =
          positionState.position.usdcBalance
          + positionState.position.withdrawableAssets;

        if (parsed.assets > available) {
          setBankWithdrawError(
            "Enter an amount no greater than your available balance.",
          );
          return;
        }

        const moonPayWindow = window.open("about:blank", "_blank");
        if (!moonPayWindow) {
          setBankWithdrawError(
            "Your browser blocked the MoonPay window. Allow popups and try again.",
          );
          return;
        }

        moonPayWindow.opener = null;
        setBankWithdrawSubmitting(true);
        setBankWithdrawError(null);
        setBankWithdrawStatus("Preparing secure bank withdrawal setup…");

        try {
          const result = await api.createMoonPayOfframpUrl(bankWithdrawAmount);

          bankWithdrawal.beginMoonPayOrder(
            result.orderId,
          );
          setBankActionActive(false);

          moonPayWindow.location.replace(result.url);
        } catch (error) {
          moonPayWindow.close();
          diagnostics.error("withdrawal.moonpay_prepare_failed", error);
          setBankWithdrawStatus(null);
          setBankWithdrawPhase("setup");
          setBankWithdrawError(
            consumerErrorMessage(
              error,
              "We couldn't prepare your bank withdrawal. Try again.",
            ),
          );
        } finally {
          setBankWithdrawSubmitting(false);
        }
      },
      [
        api,
        bankWithdrawAmount,
        bankWithdrawal,
        fiatEnabled,
        positionState,
      ],
    );

  const confirmBankWithdrawal =
    useCallback(
      async () => {
        setBankActionActive(true);
        if (!fiatEnabled) {
          setBankWithdrawError(
            "Bank withdrawals are coming soon.",
          );
          setBankWithdrawPhase("setup");
          return;
        }

        if (
          !api
          || !bankWithdrawal.orderId
        ) {
          setBankWithdrawError(
            "Your Kept account is not ready yet.",
          );
          return;
        }

        setBankWithdrawSubmitting(true);
        setBankWithdrawError(null);
        setBankWithdrawStatus(
          "Checking your withdrawal details…",
        );
        setBankWithdrawPhase("sending");

        let savingsWithdrawn = false;

        try {
          const order =
            await api.getMoonPayOfframpOrder(
              bankWithdrawal.orderId,
            );

          if (
            order.status !== "ready"
            || !order.depositWalletAddress
            || !order.moonPayTransactionId
          ) {
            setBankActionActive(false);
            await bankWithdrawal.refreshOrder(
              order.id,
            );
            return;
          }

          const depositWalletAddress =
            order.depositWalletAddress;

          const acknowledgedOrder =
            await deliverBankWithdrawal({
              orderId: order.id,
              store:
                bankWithdrawal.transferStore,

              execute: async () => {
                if (
                  !config
                  || !publicClient
                  || !account
                  || !bankWithdrawal.destinationAsset
                  || positionState.kind
                    !== "ready"
                ) {
                  throw new Error(
                    "Your Kept account is not ready yet.",
                  );
                }

                const destinationAsset =
                  bankWithdrawal.destinationAsset;

                const amount =
                  BigInt(
                    order.amountAtomic,
                  );

                const recipient =
                  getAddress(
                    depositWalletAddress,
                  );

                const availableCash =
                  positionState.position
                    .usdcBalance;

                const withdrawableSavings =
                  positionState.position
                    .withdrawableAssets;

                const availableToSend =
                  availableCash
                  + withdrawableSavings;

                if (
                  amount
                  > availableToSend
                ) {
                  throw new Error(
                    "There is not enough available balance for this withdrawal.",
                  );
                }

                const requiredFromSavings =
                  amount > availableCash
                    ? amount
                      - availableCash
                    : 0n;

                let executionId:
                  string
                  | null = null;

                const acquired =
                  await transactionCoordinator
                    .run(
                      "withdraw",
                      async () => {
                        if (
                          requiredFromSavings
                          > 0n
                        ) {
                          if (
                            requiredFromSavings
                            > withdrawableSavings
                          ) {
                            throw new Error(
                              "There is not enough available savings for this withdrawal.",
                            );
                          }

                          const withdrawal =
                            buildVaultWithdrawTransaction({
                              vault:
                                config.vault,
                              receiver:
                                account,
                              owner:
                                account,
                              assets:
                                requiredFromSavings,
                              chainId:
                                config.chainId,
                            });

                          setBankWithdrawStatus(
                            "Preparing your money…",
                          );

                          const savingsWithdrawalResult =
                            await submitVaultWithdrawal({
                              withdrawal,
                              beforeSend:
                                async () =>
                                  ensureTransactionNetwork(),
                              sender,
                              receipts: {
                                waitForTransactionReceipt:
                                  async ({
                                    hash,
                                  }) => {
                                    const receipt =
                                      await publicClient
                                        .waitForTransactionReceipt({
                                          hash,
                                        });

                                    return {
                                      status:
                                        receipt.status
                                        === "success"
                                          ? "success"
                                          : "reverted",
                                    };
                                  },
                              },
                            });

                          savingsWithdrawn =
                            true;

                          await api
                            .recordTransaction(
                              {
                                type:
                                  "SAVINGS_WITHDRAWAL",
                                amountAtomic:
                                  requiredFromSavings
                                    .toString(),
                                asset:
                                  "USDC",
                                description:
                                  "Moved to available cash for bank withdrawal",
                                chainId:
                                  config.chainId
                                    .toString(),
                                transactionHash:
                                  savingsWithdrawalResult
                                    .withdrawalHash,
                                externalReference:
                                  savingsWithdrawalResult
                                    .withdrawalHash,
                              },
                              savingsWithdrawalResult
                                .withdrawalHash,
                            );
                        }

                        await ensureTransactionNetwork();

                        const provider =
                          await wallet
                            .getProvider();

                        if (!provider) {
                          throw new Error(
                            "Wallet provider is unavailable.",
                          );
                        }

                        const runner =
                          createKeptIntentsRunner({
                            sourceAddress:
                              account,
                            family:
                              "evm",
                            provider,
                          });

                        try {
                          setBankWithdrawStatus(
                            "Sending your withdrawal securely…",
                          );

                          const execution =
                            await executeCryptoWithdrawal({
                              runner,
                              amount,
                              recipient,
                              destinationAsset,
                            });

                          executionId =
                            execution.id;
                        } finally {
                          runner.dispose?.();
                        }
                      },
                    );

                if (!acquired) {
                  throw new Error(
                    "Another transaction is already in progress.",
                  );
                }

                if (!executionId) {
                  throw new Error(
                    "Withdrawal execution did not return a reference.",
                  );
                }

                return {
                  id: executionId,
                };
              },

              acknowledge:
                (transferReference) =>
                  api.markMoonPayOfframpFundsSent(
                    order.id,
                    transferReference,
                  ),
            });

          void acknowledgedOrder;
          setBankWithdrawAmount("");
          setBankWithdrawError(null);
          setBankActionActive(false);

          await Promise.all([
            refreshPosition(),
            refreshProductData(),
          ]);

          await bankWithdrawal.refreshOrder(
            order.id,
          );
        } catch (error) {
          diagnostics.warn(
            "withdrawal.bank_execution_failed",
            error,
          );

          const pendingTransfer =
            bankWithdrawal.transferStore
              .load(
                bankWithdrawal.orderId,
              );

          if (pendingTransfer) {
            setBankWithdrawStatus(
              "Your transfer was sent. Kept is confirming it now…",
            );
            setBankWithdrawError(
              "We couldn't confirm the transfer yet. Kept will retry without sending your money again.",
            );
            setBankWithdrawPhase(
              "processing",
            );

            await bankWithdrawal.refreshOrder(
              bankWithdrawal.orderId,
            );
          } else {
            setBankWithdrawStatus(null);

            if (savingsWithdrawn) {
              setBankWithdrawError(
                "The bank transfer couldn't be completed. Your money was withdrawn from savings successfully and is now available in Kept.",
              );
            } else {
              setBankWithdrawError(
                consumerErrorMessage(
                  error,
                  "We could not complete this bank withdrawal. Try again.",
                ),
              );
            }

            setBankWithdrawPhase(
              "failed",
            );
          }

          if (
            savingsWithdrawn
            || pendingTransfer
          ) {
            await Promise.all([
              refreshPosition(),
              refreshProductData(),
            ]);
          }
        } finally {
          setBankWithdrawSubmitting(false);
        }
      },
      [
        account,
        api,
        bankWithdrawal,

        config,
        fiatEnabled,
        ensureTransactionNetwork,
        positionState,
        publicClient,
        refreshPosition,
        refreshProductData,
        sender,
        transactionCoordinator,
        wallet,
      ],
    );

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

        positionState={positionState}

        goalFundingState={goalFundingState}

        productState={productState}

        savingsPerformanceState={savingsPerformanceState}

        savingsMarketStatusState={savingsMarketStatusState}

        onRefreshSavingsPerformance={refreshSavingsPerformance}

        onRefreshSavingsMarketStatus={refreshSavingsMarketStatus}

        stagingFaucetAvailable={stagingFaucetAvailable}

        stagingFaucetClaiming={stagingFaucetClaiming}

        stagingFaucetStatus={stagingFaucetStatus}

        stagingFaucetError={stagingFaucetError}

        onClaimStagingFaucet={() => void claimStagingFaucet()}

        depositAmount={depositAmount}

        depositStatus={depositStatus}

        depositError={depositError}

        depositQuoteState={depositQuoteState}

        withdrawAmount={withdrawAmount}

        withdrawStatus={withdrawStatus}

        withdrawError={withdrawError}

        pendingTransaction={pendingTransaction}

        creatingGoal={creatingGoal}

        deletingGoal={deletingGoal}

        deleteGoalStatus={deleteGoalStatus}

        deleteGoalError={deleteGoalError}

        onDeleteGoal={deleteGoal}

        onDismissGoalDeletion={dismissGoalDeletion}

        goalError={goalError}

        creatingCommitment={creatingCommitment}

        commitmentStatus={commitmentStatus}

        commitmentError={commitmentError}

        allocatingGoal={allocatingGoal}

        allocationStatus={allocationStatus}

        allocationError={allocationError}

        onDepositAmountChange={setDepositAmount}

        onSubmitDeposit={submitDeposit}

        onDismissDeposit={dismissDeposit}

        onWithdrawAmountChange={setWithdrawAmount}

        onSubmitWithdrawal={submitWithdrawal}

        onDismissWithdrawal={dismissWithdrawal}

        onRefreshPosition={refreshPosition}

        onRefreshProductData={refreshProductData}

        onCreateGoal={createGoal}

        onCreateCommitment={createCommitment}

        onAddToGoal={addToGoal}

        onDismissGoal={dismissGoal}

        onDismissCommitment={dismissCommitment}

        onDismissAllocation={dismissAllocation}

        onRemoveFromGoal={removeFromGoal}

        onMoveBetweenGoals={moveBetweenGoals}

        rewardStates={rewardStates}

        claimingRewardId={claimingRewardId}

        rewardClaimError={rewardClaimError}

        onClaimReward={claimReward}
        cryptoAmount={
          cryptoWithdrawAmount
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
          null
        }

        onCryptoAmountChange={
          handleCryptoWithdrawAmountChange
        }

        onCryptoRecipientChange={
          handleCryptoRecipientChange
        }

        onCryptoDestinationAssetChange={
          handleCryptoDestinationAssetChange
        }

        onPreviewCryptoWithdrawal={() =>
          void previewCryptoTransfer()
        }
        onExecuteCryptoWithdrawal={() =>
          void executeCryptoTransfer()
        }

        bankAmount={
          bankWithdrawAmount
        }

        bankSubmitting={
          bankWithdrawSubmitting
        }

        bankStatus={
          bankWithdrawStatus
        }

        bankError={
          bankWithdrawError
        }

        bankOrderId={
          bankWithdrawal.orderId
        }

        bankPhase={
          bankWithdrawPhase
        }

        bankReviewAmount={
          bankWithdrawal.order
            ? formatUsdc(
                BigInt(
                  bankWithdrawal.order.amountAtomic,
                ),
              )
            : null
        }

        bankMinimumReceive={
          bankWithdrawal.minimumReceive
        }

        onBankAmountChange={(value) => {
          setBankWithdrawAmount(value);
          setBankWithdrawError(null);
          setBankWithdrawStatus(null);
          setBankWithdrawPhase("setup");
          setBankActionActive(true);
          bankWithdrawal.resetOrder();
        }}

        onStartBankWithdrawal={() =>
          void startBankWithdrawal()
        }

        onRefreshBankWithdrawal={() => {
          if (bankWithdrawal.orderId) {
            setBankActionActive(false);
            void bankWithdrawal.refreshOrder(
              bankWithdrawal.orderId,
            );
          }
        }}

        onConfirmBankWithdrawal={() =>
          void confirmBankWithdrawal()
        }
      />
    </AppShell>
  );
}
