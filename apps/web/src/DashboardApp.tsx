import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  type GoalDto,
} from "@/api/kept-api";
import { type Session } from "@/auth/session";
import { useKeptEvmWallet } from "@/chain/evm-wallet";
import { checkNetworkReadiness } from "@/chain/network-readiness";
import { useKeptTransactionSender } from "@/chain/transaction-sender";
import {
  buildCreateCommitmentTransaction,
  confirmCommitmentCreation,
  referenceIdForCommitment,
  timestampSeconds,
} from "@/commitments/commitment-manager";

import {
  runCommitmentCreation,
  type CommitmentCreationAttempt,
} from "@/commitments/creation-flow";

import {
  clearPendingCommitmentAttempt,
  loadPendingCommitmentAttempt,
  reconcilePendingAttempt,
  savePendingCommitmentAttempt,
} from "@/commitments/pending-attempt";

import { AccountMenu } from "@/components/AccountMenu";

import { AppShell } from "@/components/AppShell";

import type { CreateCommitmentInput } from "@/features/commitments/CreateCommitmentDialog";

import {
  useProductDataController,
} from "@/features/dashboard/use-product-data-controller";

import {
  useSavingsStatusController,
} from "@/features/dashboard/use-savings-status-controller";

import { formatUsdc } from "@/features/savings/format";

import {
  allocationInputError,
  deallocationInputError,
  previewAllocationShares,
} from "@/features/goals/funding";

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

export function DashboardApp({ session }: { readonly session: Session }) {
  const navigate = useNavigate();

  const fiatEnabled =
    readFiatEnabled(
      import.meta.env,
    );

  const [creatingGoal, setCreatingGoal] = useState(false);

  const [goalError, setGoalError] = useState<string | null>(null);

  const [creatingCommitment, setCreatingCommitment] = useState(false);

  const [commitmentStatus, setCommitmentStatus] = useState<string | null>(null);

  const [commitmentError, setCommitmentError] = useState<string | null>(null);

  const [allocatingGoal, setAllocatingGoal] = useState(false);

  const [allocationStatus, setAllocationStatus] = useState<string | null>(null);

  const [allocationError, setAllocationError] = useState<string | null>(null);

  const allocationPending = useRef(false);

  const pendingCommitmentAttempt = useRef<CommitmentCreationAttempt | null>(
    null,
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

  useEffect(() => {
    if (!account) {
      pendingCommitmentAttempt.current = null;

      return;
    }

    try {
      pendingCommitmentAttempt.current = loadPendingCommitmentAttempt(
        globalThis.localStorage,

        account,
      );
    } catch {
      pendingCommitmentAttempt.current = null;
    }
  }, [account]);

  useEffect(() => {
    if (!account || productState.kind !== "ready") return;

    const attempt = pendingCommitmentAttempt.current;

    if (!attempt) return;

    const reconciled = reconcilePendingAttempt(
      attempt,
      productState.commitments,
    );

    pendingCommitmentAttempt.current = reconciled;

    if (reconciled) {
      savePendingCommitmentAttempt(
        globalThis.localStorage,
        account,
        reconciled,
      );
    } else {
      clearPendingCommitmentAttempt(globalThis.localStorage, account);
    }
  }, [account, productState]);

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

  const createGoal = useCallback(
    async (input: {
      readonly name: string;

      readonly targetAmount: string;

      readonly targetDate: string | null;
    }) => {
      if (!api) {
        setGoalError("Kept's service is not configured.");

        return false;
      }

      const name = input.name.trim();

      if (!name) {
        setGoalError("Give your goal a name.");

        return false;
      }

      const parsed = parseUsdcDepositAmount(input.targetAmount);

      if ("error" in parsed || parsed.assets <= 0n) {
        setGoalError("Enter a valid target amount greater than zero.");

        return false;
      }

      setCreatingGoal(true);

      setGoalError(null);

      try {
        await api.createGoal({
          name,

          targetAmountAtomic: parsed.assets.toString(),

          targetDate: input.targetDate,
        });

        await refreshProductData();

        return true;
      } catch (error) {
        diagnostics.error("api.goal_create_failed", error);

        setGoalError(
          consumerErrorMessage(
            error,
            "We could not create your goal. Try again.",
          ),
        );

        return false;
      } finally {
        setCreatingGoal(false);
      }
    },
    [api, refreshProductData],
  );

  type GoalAllocationDirection = "fund" | "unfund";

  const changeGoalAllocation = useCallback(
    async (
      goal: GoalDto,

      amount: string,

      direction: GoalAllocationDirection,
    ): Promise<boolean> => {
      if (allocationPending.current) {
        setAllocationError("An allocation request is already in progress.");

        return false;
      }

      if (
        !api ||
        !config ||
        !publicClient ||
        goalFundingState.kind !== "ready"
      ) {
        setAllocationError(
          "Your goal balances are not ready yet. Refresh and try again.",
        );

        return false;
      }

      const parsed = parseUsdcDepositAmount(amount);

      if ("error" in parsed || parsed.assets <= 0n) {
        setAllocationError("Enter a valid amount greater than zero.");

        return false;
      }

      const goalFunding = goalFundingState.funding.byGoal.get(goal.id);

      if (!goalFunding) {
        setAllocationError("This goal balance is not available.");

        return false;
      }

      allocationPending.current = true;

      setAllocatingGoal(true);

      setAllocationError(null);

      try {
        const requiredShares = await previewAllocationShares({
          assets: parsed.assets,

          publicClient: {
            readContract: (input) =>
              publicClient.readContract(input as never) as Promise<bigint>,
          },

          vault: config.vault,
        });

        const validationError =
          direction === "fund"
            ? allocationInputError(
              parsed.assets,

              requiredShares,

              goalFundingState.funding.unallocatedShares,
            )
            : deallocationInputError(
              parsed.assets,

              requiredShares,

              goalFunding.allocatedShares,
            );

        if (validationError) {
          setAllocationError(validationError);

          return false;
        }

        setAllocationStatus(
          direction === "fund"
            ? "Adding savings to your goal…"
            : "Moving savings out of your goal…",
        );

        await api.allocateGoalShares(
          goal.id,

          {
            shareDeltaAtomic:
              direction === "fund"
                ? requiredShares.toString()
                : (-requiredShares).toString(),

            reason: "manual",
          },

          globalThis.crypto.randomUUID(),
        );

        await refreshProductData();

        setAllocationStatus(null);

        return true;
      } catch (error) {
        diagnostics.error(
          direction === "fund"
            ? "api.goal_allocation_failed"
            : "api.goal_deallocation_failed",

          error,
        );

        setAllocationStatus(null);

        setAllocationError(
          consumerErrorMessage(
            error,

            direction === "fund"
              ? "We could not add those savings to your goal. Refresh and try again."
              : "We could not move those savings out of your goal. Refresh and try again.",
          ),
        );

        return false;
      } finally {
        allocationPending.current = false;

        setAllocatingGoal(false);
      }
    },
    [api, config, goalFundingState, publicClient, refreshProductData],
  );

  const addToGoal = useCallback(
    (goal: GoalDto, amount: string) =>
      changeGoalAllocation(goal, amount, "fund"),

    [changeGoalAllocation],
  );

  const removeFromGoal = useCallback(
    (goal: GoalDto, amount: string) =>
      changeGoalAllocation(goal, amount, "unfund"),

    [changeGoalAllocation],
  );

  const moveBetweenGoals = useCallback(
    async (
      fromGoal: GoalDto,

      toGoal: GoalDto,

      amount: string,
    ): Promise<boolean> => {
      if (allocationPending.current) {
        setAllocationError("A savings change is already in progress.");

        return false;
      }

      if (
        !api ||
        !config ||
        !publicClient ||
        goalFundingState.kind !== "ready"
      ) {
        setAllocationError(
          "Your goal balances are not ready yet. Refresh and try again.",
        );

        return false;
      }

      if (fromGoal.id === toGoal.id) {
        setAllocationError("Choose a different goal.");

        return false;
      }

      const parsed = parseUsdcDepositAmount(amount);

      if ("error" in parsed || parsed.assets <= 0n) {
        setAllocationError("Enter a valid amount greater than zero.");

        return false;
      }

      const sourceFunding = goalFundingState.funding.byGoal.get(fromGoal.id);

      if (!sourceFunding) {
        setAllocationError("This goal balance is not available.");

        return false;
      }

      allocationPending.current = true;

      setAllocatingGoal(true);

      setAllocationError(null);

      try {
        const shares = await previewAllocationShares({
          assets: parsed.assets,

          publicClient: {
            readContract: (input) =>
              publicClient.readContract(input as never) as Promise<bigint>,
          },

          vault: config.vault,
        });

        const validationError = deallocationInputError(
          parsed.assets,

          shares,

          sourceFunding.allocatedShares,
        );

        if (validationError) {
          setAllocationStatus(null);

          setAllocationError(validationError);

          return false;
        }

        setAllocationStatus("Moving savings…");

        await api.reallocateGoalShares(
          {
            fromGoalId: fromGoal.id,

            toGoalId: toGoal.id,

            shareAmountAtomic: shares.toString(),
          },

          globalThis.crypto.randomUUID(),
        );

        await refreshProductData();

        setAllocationStatus(null);

        return true;
      } catch (error) {
        diagnostics.error(
          "api.goal_reallocation_failed",

          error,
        );

        setAllocationStatus(null);

        setAllocationError(
          consumerErrorMessage(
            error,

            "We could not move those savings. Refresh and try again.",
          ),
        );

        return false;
      } finally {
        allocationPending.current = false;

        setAllocatingGoal(false);
      }
    },
    [api, config, goalFundingState, publicClient, refreshProductData],
  );

  const createCommitment = useCallback(
    async (goal: GoalDto, input: CreateCommitmentInput) => {
      if (
        !api ||
        !config ||
        !commitmentManagerConfig ||
        !publicClient ||
        !account
      ) {
        setCommitmentError(
          "Commitments are unavailable because Kept is not configured.",
        );

        return false;
      }

      const parsed = parseUsdcDepositAmount(input.target);

      if ("error" in parsed || parsed.assets <= 0n) {
        setCommitmentError("Enter a valid weekly savings amount.");

        return false;
      }

      const parameters = {
        targetAmountAtomic: parsed.assets.toString(),
        periodDays: 7,
      };

      const draftInput = {
        goalId: goal.id,

        definition: { code: input.code, version: 1 },

        parameters,

        epochStart: input.startAt.toISOString(),

        epochEnd: input.endAt.toISOString(),

        verificationDeadline: input.verificationDeadline.toISOString(),
      };

      const recoverableDraft = productState.commitments.find(
        (commitment) =>
          commitment.state === "DRAFT" &&
          commitment.savingsGoalId === goal.id &&
          commitment.definition.code === input.code &&
          commitment.parameters.targetAmountAtomic ===
          parameters.targetAmountAtomic,
      );

      const existingAttempt =
        pendingCommitmentAttempt.current ??
        (recoverableDraft
          ? {
            draftInput: {
              goalId: recoverableDraft.savingsGoalId,

              definition: recoverableDraft.definition,

              parameters: recoverableDraft.parameters,

              epochStart: recoverableDraft.epochStart,

              epochEnd: recoverableDraft.epochEnd,

              verificationDeadline: recoverableDraft.verificationDeadline,
            },

            draftIdempotencyKey: globalThis.crypto.randomUUID(),

            draft: recoverableDraft,
          }
          : null);

      if (existingAttempt?.terminalFailure) {
        setCommitmentError(
          "Kept couldn't finish setting up this commitment. Contact support before trying again.",
        );

        return false;
      }

      if (
        existingAttempt &&
        (existingAttempt.draftInput.goalId !== goal.id ||
          existingAttempt.draftInput.definition.code !== input.code ||
          existingAttempt.draftInput.parameters.targetAmountAtomic !==
          parameters.targetAmountAtomic)
      ) {
        setCommitmentError(
          "Finish retrying your pending commitment before creating a different one.",
        );

        return false;
      }

      setCreatingCommitment(true);

      setCommitmentError(null);

      let succeeded = false;

      const acquired = await transactionCoordinator.run(
        "commitment",
        async () => {
          const result = await runCommitmentCreation(existingAttempt, {
            draftInput,

            draftIdempotencyKey:
              existingAttempt?.draftIdempotencyKey ??
              globalThis.crypto.randomUUID(),

            createDraft: (request, idempotencyKey) =>
              api.createCommitment(
                request,

                idempotencyKey,
              ),

            sendTransaction: async (draft) => {
              await ensureTransactionNetwork();

              return sender.sendTransaction(
                buildCreateCommitmentTransaction({
                  manager: commitmentManagerConfig.address,

                  chainId: config.chainId,

                  referenceId: referenceIdForCommitment(draft.id),

                  startAt: timestampSeconds(draft.epochStart),

                  endAt: timestampSeconds(draft.epochEnd),
                }),
              );
            },

            confirmTransaction: async (draft, transactionHash) => {
              const receipt = await publicClient.waitForTransactionReceipt({
                hash: transactionHash,

                confirmations:
                  import.meta.env.VITE_ENABLE_LOCAL_ANVIL === "true" ? 1 : 2,
              });

              return confirmCommitmentCreation({
                manager: commitmentManagerConfig.address,

                owner: account,

                referenceId: referenceIdForCommitment(draft.id),

                startAt: timestampSeconds(draft.epochStart),

                endAt: timestampSeconds(draft.epochEnd),

                transactionHash,

                receipt: {
                  status: receipt.status === "success" ? "success" : "reverted",

                  logs: receipt.logs,
                },

                readContract: (request) =>
                  publicClient.readContract(request as never),
              });
            },

            activateDraft: async (draft, settlement) => {
              const result = await api.activateCommitment(draft, {
                onchainCommitmentId: settlement.commitmentId.toString(),

                transactionHash: settlement.transactionHash,
              });

              return result;
            },

            onStage: (stage) =>
              setCommitmentStatus(
                {
                  draft: "Preparing your commitment…",

                  wallet: "Creating your commitment…",

                  confirmation: "Creating your commitment…",

                  activation: "Finishing your commitment…",
                }[stage],
              ),

            onAttempt: (attempt) => {
              pendingCommitmentAttempt.current = attempt;

              if (
                !savePendingCommitmentAttempt(
                  globalThis.localStorage,
                  account,
                  attempt,
                )
              ) {
                throw new Error(
                  "Local commitment recovery state could not be saved",
                );
              }
            },
          });

          if (!result.ok) {
            pendingCommitmentAttempt.current = result.attempt;

            diagnostics.error("commitment.creation_failed", result.error, {
              hasTransaction: Boolean(result.attempt?.transactionHash),

              chainConfirmed: Boolean(result.attempt?.settlement),
            });

            setCommitmentStatus(null);

            setCommitmentError(
              result.attempt?.terminalFailure
                ? "Kept could not safely reconcile this confirmed commitment. Contact support before trying again."
                : consumerErrorMessage(
                  result.error,

                  result.attempt?.settlement
                    ? "Your commitment was created, but Kept couldn't finish updating it. Try again."
                    : "We could not create your commitment. Try again.",
                ),
            );

            return;
          }

          pendingCommitmentAttempt.current = null;

          try {
            clearPendingCommitmentAttempt(globalThis.localStorage, account);
          } catch {
            // The API and contract are synchronized; stale local recovery data is ignored.
          }

          setCommitmentStatus("Commitment created. Updating your goal…");

          await refreshProductData();

          setCommitmentStatus(null);

          succeeded = true;
        },
      );

      setCreatingCommitment(false);

      if (!acquired) {
        setCommitmentStatus(null);

        setCommitmentError("Another account request is already in progress.");
      }

      return succeeded;
    },
    [
      account,
      api,
      commitmentManagerConfig,
      config,
      ensureTransactionNetwork,
      productState.commitments,
      publicClient,
      refreshProductData,
      sender,
      transactionCoordinator,
    ],
  );

  const dismissGoal = useCallback(() => setGoalError(null), []);

  const dismissCommitment = useCallback(() => {
    setCommitmentError(null);

    setCommitmentStatus(null);
  }, []);

  const dismissAllocation = useCallback(() => {
    setAllocationError(null);

    setAllocationStatus(null);
  }, []);

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
