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
  encodeFunctionData,
  erc20Abi,
} from "viem";
import {
  createKeptApi,
  readApiBaseUrl,
  type GoalDto,
  type CommitmentDto,
} from "@/api/kept-api";
import { type Session } from "@/auth/session";
import { useKeptEvmWallet } from "@/chain/evm-wallet";
import { checkNetworkReadiness } from "@/chain/network-readiness";
import { useKeptTransactionSender } from "@/chain/transaction-sender";
import {
  buildCancelCommitmentTransaction,
  buildCreateCommitmentTransaction,
  commitmentManagerAbi,
  confirmCommitmentCreation,
  readCommitmentRewardState,
  referenceIdForCommitment,
  timestampSeconds,
  type CommitmentRewardState,
} from "@/commitments/commitment-manager";

import { claimCommitmentReward } from "@/commitments/reward-claim";

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
  beginProductRefresh,
  failProductRefresh,
  initialProductDataState,
  type ProductDataState,
} from "@/features/dashboard/product-data-state";

import {
  currentPositionState,
  type BoundPositionState,
} from "@/features/dashboard/position-context";

import type { PositionState } from "@/features/savings/BalanceCard";

import type { SavingsMarketStatusState } from "@/features/savings/SavingsMarketStatus";

import {
  allocationInputError,
  deallocationInputError,
  previewAllocationShares,
  readGoalFunding,
  type GoalFundingState,
} from "@/features/goals/funding";

import { runGoalDeletion } from "@/features/goals/delete-goal-flow";

import {
  currentDepositQuote,
  type DepositQuoteState,
} from "@/features/savings/deposit-quote";

import { ConsumerError, consumerErrorMessage } from "@/lib/consumer-error";

import { diagnostics } from "@/lib/diagnostics";

import { createLatestRequestGate } from "@/lib/latest-request";

import { DashboardPage } from "@/pages/DashboardPage";

import { readCommitmentManagerConfig, readVaultConfig } from "@/vault/config";

import {
  minimumUsdcDepositError,
  parseUsdcDepositAmount,
} from "@/vault/deposit-input";

import { submitVaultDeposit, submitVaultWithdrawal } from "@/vault/executor";

import { readVaultDepositQuote } from "@/vault/fees";

import { readVaultPosition } from "@/vault/position";

import { getVaultTransactionCoordinator } from "@/vault/transaction-lock";

import {
  buildVaultDepositTransactions,
  buildVaultWithdrawTransaction,
} from "@/vault/transactions";

import {
  resolveKeptFundingAssets,
  type FundingAsset,
} from "@/features/funding/intents/supported-tokens";

import {
  createKeptIntentsRunner,
} from "@/features/funding/intents/runner";

import {
  previewCryptoWithdrawal,
} from "@/features/withdrawal/preview-crypto-withdrawal";
import { executeCryptoWithdrawal } from "./features/withdrawal/execute-withdrawal";


function fundingRefreshError(
  current: GoalFundingState,
  message: string,
): GoalFundingState {
  const funding = current.kind === "loading" ? undefined : current.funding;

  return funding
    ? { kind: "error", message, funding }
    : { kind: "error", message };
}

export function DashboardApp({ session }: { readonly session: Session }) {
  const navigate = useNavigate();
  const [depositAmount, setDepositAmount] = useState("");

  const [depositStatus, setDepositStatus] = useState<string | null>(null);

  const [depositError, setDepositError] = useState<string | null>(null);

  const [storedDepositQuote, setStoredDepositQuote] =
    useState<DepositQuoteState>({ kind: "idle" });

  const [withdrawAmount, setWithdrawAmount] = useState("");

  const [withdrawStatus, setWithdrawStatus] = useState<string | null>(null);

  const [withdrawError, setWithdrawError] = useState<string | null>(null);


  const [
    cryptoWithdrawAmount,
    setCryptoWithdrawAmount,
  ] = useState("");

  const [
    cryptoRecipient,
    setCryptoRecipient,
  ] = useState("");

  const [
    cryptoDestinationAssets,
    setCryptoDestinationAssets,
  ] = useState<
    readonly FundingAsset[]
  >([]);

  const [
    cryptoDestinationAssetId,
    setCryptoDestinationAssetId,
  ] = useState<
    string | null
  >(null);

  const [
    cryptoPreviewing,
    setCryptoPreviewing,
  ] = useState(false);

  const [
    cryptoPreviewReady,
    setCryptoPreviewReady,
  ] = useState(false);

  const [
    cryptoPreviewStatus,
    setCryptoPreviewStatus,
  ] = useState<
    string | null
  >(null);

  const [
    cryptoPreviewError,
    setCryptoPreviewError,
  ] = useState<
    string | null
  >(null);

  const [
    cryptoExecuting,
    setCryptoExecuting,
  ] = useState(false);

  const [
    cryptoExecutionStatus,
    setCryptoExecutionStatus,
  ] = useState<
    string | null
  >(null);

  const [
    cryptoExecutionError,
    setCryptoExecutionError,
  ] = useState<
    string | null
  >(null);

  useEffect(
    () => {
      let cancelled =
        false;

      void (
        async () => {
          try {
            const {
              origins,
              destination,
            } =
              await resolveKeptFundingAssets();

            const assets =
              [
                destination,
                ...origins,
              ].filter(
                (
                  asset,
                  index,
                  all,
                ) =>
                  all.findIndex(
                    (
                      candidate,
                    ) =>
                      candidate.assetId ===
                      asset.assetId,
                  ) ===
                  index,
              );

            setCryptoDestinationAssets(
              assets,
            );

            setCryptoDestinationAssetId(
              (
                current,
              ) =>
                current ??
                destination.assetId,
            );
          } catch (
          error
          ) {
            diagnostics.error(
              "withdrawal.assets_load_failed",
              error,
            );

            if (
              !cancelled
            ) {
              setCryptoPreviewError(
                "Withdrawal routes are currently unavailable.",
              );
            }
          }
        }
      )();

      return () => {
        cancelled =
          true;
      };
    },
    [],
  );

  const invalidateCryptoPreview =
    useCallback(
      () => {
        setCryptoPreviewReady(
          false,
        );

        setCryptoPreviewStatus(
          null,
        );

        setCryptoPreviewError(
          null,
        );

        setCryptoExecutionStatus(
          null,
        );

        setCryptoExecutionError(
          null,
        );
      },
      [],
    );

  const handleCryptoWithdrawAmountChange =
    useCallback(
      (
        value: string,
      ) => {
        setCryptoWithdrawAmount(
          value,
        );

        invalidateCryptoPreview();
      },
      [
        invalidateCryptoPreview,
      ],
    );

  const handleCryptoRecipientChange =
    useCallback(
      (
        value: string,
      ) => {
        setCryptoRecipient(
          value,
        );

        invalidateCryptoPreview();
      },
      [
        invalidateCryptoPreview,
      ],
    );

  const handleCryptoDestinationAssetChange =
    useCallback(
      (
        assetId: string,
      ) => {
        setCryptoDestinationAssetId(
          assetId,
        );

        invalidateCryptoPreview();
      },
      [
        invalidateCryptoPreview,
      ],
    );

  const [storedPositionState, setStoredPositionState] =
    useState<BoundPositionState>({ kind: "unavailable" });

  const [productState, setProductState] = useState<ProductDataState>(
    initialProductDataState,
  );

  const [creatingGoal, setCreatingGoal] = useState(false);

  const [deletingGoal, setDeletingGoal] = useState(false);

  const [deleteGoalStatus, setDeleteGoalStatus] = useState<string | null>(null);

  const [deleteGoalError, setDeleteGoalError] = useState<string | null>(null);

  const [goalError, setGoalError] = useState<string | null>(null);

  const [creatingCommitment, setCreatingCommitment] = useState(false);

  const [commitmentStatus, setCommitmentStatus] = useState<string | null>(null);

  const [commitmentError, setCommitmentError] = useState<string | null>(null);

  const [goalFundingState, setGoalFundingState] = useState<GoalFundingState>({
    kind: "loading",
  });

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
    bankWithdrawStatus,
    setBankWithdrawStatus,
  ] = useState<string | null>(
    null,
  );

  const [
    bankWithdrawError,
    setBankWithdrawError,
  ] = useState<string | null>(
    null,
  );

  const positionRequestGate = useMemo(() => createLatestRequestGate(), []);

  const depositQuoteRequestGate = useMemo(() => createLatestRequestGate(), []);

  const productRequestGate = useMemo(() => createLatestRequestGate(), []);

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

  const account =
    wallet.address && isAddress(wallet.address)
      ? getAddress(wallet.address)
      : null;

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

  type SavingsPerformanceState =
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

  const [savingsPerformanceState, setSavingsPerformanceState] =
    useState<SavingsPerformanceState>({
      kind: "unavailable",
    });

  const refreshSavingsPerformance = useCallback(async () => {
    if (!api || !account) {
      setSavingsPerformanceState({
        kind: "unavailable",
      });

      return;
    }

    setSavingsPerformanceState({
      kind: "loading",
    });

    try {
      const performance = await api.getSavingsPerformance();

      setSavingsPerformanceState({
        kind: "ready",

        earningsAssets: BigInt(performance.earningsAssetsAtomic),
      });
    } catch (error) {
      diagnostics.warn(
        "savings.performance_refresh_failed",

        error,
      );

      setSavingsPerformanceState({
        kind: "error",
      });
    }
  }, [account, api]);

  const [savingsMarketStatusState, setSavingsMarketStatusState] =
    useState<SavingsMarketStatusState>({
      kind: "unavailable",
    });

  const [stagingFaucetClaiming, setStagingFaucetClaiming] =
    useState(false);

  const [stagingFaucetStatus, setStagingFaucetStatus] =
    useState<string | null>(null);

  const [stagingFaucetError, setStagingFaucetError] =
    useState<string | null>(null);

  const refreshSavingsMarketStatus = useCallback(async () => {
    if (!api || !account) {
      setSavingsMarketStatusState({
        kind: "unavailable",
      });

      return;
    }

    setSavingsMarketStatusState({
      kind: "loading",
    });

    try {
      const status = await api.getSavingsMarketStatus();

      setSavingsMarketStatusState({
        kind: "ready",

        suppliedAssets:
          status.suppliedAssetsAtomic === null
            ? null
            : BigInt(status.suppliedAssetsAtomic),

        supplyCapAssets:
          status.supplyCapAssetsAtomic === null
            ? null
            : BigInt(status.supplyCapAssetsAtomic),

        availableToDepositAssets:
          status.availableToDepositAtomic === null
            ? null
            : BigInt(status.availableToDepositAtomic),

        availableToWithdrawAssets: BigInt(status.availableToWithdrawAtomic),

        tvlAssets: BigInt(status.tvlAssetsAtomic),

        grossApyBps: Number(status.grossApyBps),

        netApyBps: Number(status.netApyBps),
      });
    } catch (error) {
      diagnostics.warn("savings.market_status_refresh_failed", error);

      setSavingsMarketStatusState({
        kind: "error",
      });
    }
  }, [account, api]);



  const positionState: PositionState = currentPositionState(
    storedPositionState,
    {
      account,

      chainId: wallet.liveChainId,
    },
  );

  const depositQuoteState = currentDepositQuote(
    storedDepositQuote,
    depositAmount,
  );

  const getCurrentWalletChainId = wallet.getCurrentChainId;

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

  const refreshPosition = useCallback(async () => {
    const requestId = positionRequestGate.begin();

    if (!config || !publicClient) {
      if (positionRequestGate.isCurrent(requestId)) {
        setStoredPositionState({
          kind: "error",
          message: "Savings are unavailable because Kept is not configured.",
        });
      }

      return;
    }

    if (!account) {
      if (positionRequestGate.isCurrent(requestId)) {
        setStoredPositionState({ kind: "unavailable" });
      }

      return;
    }

    setStoredPositionState({ kind: "loading" });

    try {
      const liveWalletChainId = await getCurrentWalletChainId();

      if (
        wallet.liveChainId === null ||
        wallet.liveChainId !== liveWalletChainId
      ) {
        if (positionRequestGate.isCurrent(requestId)) {
          setStoredPositionState({
            kind: "error",

            message:
              "Your Kept account is getting ready. Try again in a moment.",
          });
        }

        return;
      }

      const network = await checkNetworkReadiness({
        expectedChainId: config.chainId,

        walletChainId: liveWalletChainId,

        rpc: publicClient,
      });

      if (!network.ready) {
        if (positionRequestGate.isCurrent(requestId)) {
          diagnostics.warn("wallet.network_not_ready", network.diagnostic);

          setStoredPositionState({ kind: "error", message: network.message });
        }

        return;
      }

      const position = await readVaultPosition({
        publicClient: {
          readContract: (input) =>
            publicClient.readContract(input as never) as Promise<bigint>,
        },

        usdc: config.usdc,

        vault: config.vault,

        account,
      });

      if (positionRequestGate.isCurrent(requestId)) {
        setStoredPositionState({
          kind: "ready",

          account,

          chainId: config.chainId,

          position,
        });
      }
    } catch (error) {
      if (positionRequestGate.isCurrent(requestId)) {
        diagnostics.error("vault.position_refresh_failed", error);

        setStoredPositionState({
          kind: "error",

          message: consumerErrorMessage(
            error,
            "We could not refresh your savings. Try again.",
          ),
        });
      }
    }
  }, [
    account,
    config,
    getCurrentWalletChainId,
    positionRequestGate,
    publicClient,
    wallet.liveChainId,
  ]);

  const claimStagingFaucet = useCallback(async () => {
    if (
      !api
      || !account
      || config?.chainId !== 10_143
    ) {
      setStagingFaucetError(
        "Test funds are unavailable right now.",
      );

      return;
    }

    setStagingFaucetClaiming(true);
    setStagingFaucetStatus(
      "Adding test funds to your Kept wallet…",
    );
    setStagingFaucetError(null);

    try {
      const result =
        await api.claimStagingFaucet();

      setStagingFaucetStatus(
        `Added ${(
          BigInt(result.amountAtomic)
          / 1_000_000n
        ).toString()} test USDC.`,
      );

      await refreshPosition();
    } catch (error) {
      diagnostics.error(
        "staging.faucet_claim_failed",
        error,
      );

      setStagingFaucetStatus(null);

      setStagingFaucetError(
        consumerErrorMessage(
          error,
          "We could not add test funds. Try again.",
        ),
      );
    } finally {
      setStagingFaucetClaiming(false);
    }
  }, [
    account,
    api,
    config,
    refreshPosition,
  ]);

  const refreshProductData = useCallback(async () => {
    const requestId = productRequestGate.begin();

    setProductState(beginProductRefresh);

    setGoalFundingState((current) =>
      current.kind === "ready" ? current : { kind: "loading" },
    );

    if (!api) {
      if (productRequestGate.isCurrent(requestId)) {
        setProductState((current) =>
          failProductRefresh(current, "Kept's service is not configured."),
        );

        setGoalFundingState({
          kind: "error",
          message:
            "Goal balances are unavailable because Kept is not configured.",
        });
      }

      return;
    }

    try {
      const [goals, commitments] = await Promise.all([
        api.listGoals(),

        api.listCommitments(),
      ]);

      if (productRequestGate.isCurrent(requestId)) {
        setProductState({ kind: "ready", goals, commitments });
      }

      if (!config || !publicClient) {
        if (productRequestGate.isCurrent(requestId)) {
          setGoalFundingState({
            kind: "error",

            message:
              "Goal balances are unavailable because Kept is not configured.",
          });
        }

        return;
      }

      try {
        if (!account) {
          if (productRequestGate.isCurrent(requestId)) {
            setGoalFundingState({
              kind: "error",

              message: "Your Kept account is not ready yet.",
            });
          }

          return;
        }

        const allocations = await Promise.all(
          goals.map((goal) => api.getGoalAllocation(goal.id)),
        );

        const funding = await readGoalFunding({
          allocations,

          publicClient: {
            readContract: (input) =>
              publicClient.readContract(input as never) as Promise<bigint>,
          },

          vault: config.vault,
        });

        if (productRequestGate.isCurrent(requestId)) {
          setGoalFundingState({ kind: "ready", funding });
        }
      } catch (error) {
        if (productRequestGate.isCurrent(requestId)) {
          diagnostics.error("api.goal_funding_refresh_failed", error);

          setGoalFundingState((current) =>
            fundingRefreshError(
              current,

              "We could not reconcile your goal balances. Refresh before assigning more savings.",
            ),
          );
        }
      }
    } catch (error) {
      if (productRequestGate.isCurrent(requestId)) {
        diagnostics.error("api.product_refresh_failed", error);

        setProductState((current) =>
          failProductRefresh(
            current,

            consumerErrorMessage(
              error,
              "We could not refresh your goals and commitments. Try again.",
            ),
          ),
        );

        setGoalFundingState((current) =>
          fundingRefreshError(
            current,

            "We could not refresh your goal balances. Try again.",
          ),
        );
      }
    }
  }, [account, api, config, productRequestGate, publicClient]);

  const refreshRewardStates = useCallback(
    async (commitments: readonly CommitmentDto[]) => {
      if (!commitmentManagerConfig || !publicClient) {
        return;
      }

      const completed = commitments.filter(
        (commitment) =>
          commitment.state === "COMPLETED" &&
          commitment.onchainCommitmentId !== null,
      );

      if (completed.length === 0) {
        setRewardStates({});

        return;
      }

      setRewardStates((current) => {
        const next = { ...current };

        for (const commitment of completed) {
          next[commitment.id] = {
            kind: "loading",
          };
        }

        return next;
      });

      await Promise.all(
        completed.map(async (commitment) => {
          try {
            const onchainCommitmentId = commitment.onchainCommitmentId;

            if (!onchainCommitmentId) return;

            const reward = await readCommitmentRewardState({
              manager: commitmentManagerConfig.address,

              commitmentId: onchainCommitmentId,

              readContract: (request) =>
                publicClient.readContract(request as never),
            });

            setRewardStates((current) => ({
              ...current,

              [commitment.id]: {
                kind: "ready",

                reward,
              },
            }));
          } catch (error) {
            diagnostics.warn(
              "commitment.reward_read_failed",

              error,

              {
                commitmentId: commitment.id,
              },
            );

            setRewardStates((current) => ({
              ...current,

              [commitment.id]: {
                kind: "error",

                message: "Reward details are temporarily unavailable.",
              },
            }));
          }
        }),
      );
    },

    [commitmentManagerConfig, publicClient],
  );

  useEffect(() => {
    const requestId = depositQuoteRequestGate.begin();

    const parsedAmount = parseUsdcDepositAmount(depositAmount);

    if (
      "error" in parsedAmount ||
      minimumUsdcDepositError(parsedAmount.assets) ||
      !config ||
      !publicClient ||
      positionState.kind !== "ready"
    ) {
      setStoredDepositQuote({ kind: "idle" });

      return;
    }

    setStoredDepositQuote({ kind: "loading" });

    void readVaultDepositQuote({
      assets: parsedAmount.assets,

      vault: config.vault,

      publicClient: {
        readContract: (input) =>
          publicClient.readContract(input as never) as Promise<bigint>,
      },
    })
      .then((quote) => {
        if (depositQuoteRequestGate.isCurrent(requestId)) {
          setStoredDepositQuote({ kind: "ready", quote });
        }
      })
      .catch((error) => {
        if (depositQuoteRequestGate.isCurrent(requestId)) {
          diagnostics.error("vault.deposit_quote_failed", error);

          setStoredDepositQuote({
            kind: "error",

            assets: parsedAmount.assets,

            message: consumerErrorMessage(
              error,
              "We could not calculate the fees. Try again.",
            ),
          });
        }
      });
  }, [
    config,
    depositAmount,
    depositQuoteRequestGate,
    positionState.kind,
    publicClient,
  ]);

  useEffect(() => {
    void refreshPosition();

    void refreshProductData();

    void refreshSavingsPerformance();

    void refreshSavingsMarketStatus();
  }, [
    refreshPosition,
    refreshProductData,
    refreshSavingsPerformance,
    refreshSavingsMarketStatus,
  ]);

  useEffect(() => {
    if (productState.kind !== "ready") {
      return;
    }

    void refreshRewardStates(productState.commitments);
  }, [productState, refreshRewardStates]);

  const submitDeposit = useCallback(async (): Promise<boolean> => {
    if (
      !config ||
      !publicClient ||
      !account ||
      positionState.kind !== "ready"
    ) {
      setDepositError("Your Kept account is not ready yet.");

      return false;
    }

    const parsedAmount = parseUsdcDepositAmount(depositAmount);

    if ("error" in parsedAmount) {
      setDepositError(parsedAmount.error);

      return false;
    }

    const minimumError = minimumUsdcDepositError(parsedAmount.assets);

    if (minimumError) {
      setDepositError(minimumError);

      return false;
    }

    if (
      depositQuoteState.kind !== "ready" ||
      depositQuoteState.quote.assets !== parsedAmount.assets
    ) {
      setDepositError("Wait for the fee details before adding money.");

      return false;
    }

    if (parsedAmount.assets > positionState.position.usdcBalance) {
      setDepositError("Enter an amount no greater than your available cash.");

      return false;
    }

    const [approval, deposit] = buildVaultDepositTransactions({
      usdc: config.usdc,
      vault: config.vault,
      receiver: account,
      assets: parsedAmount.assets,
      chainId: config.chainId,
    });

    let succeeded = false;

    const acquired = await transactionCoordinator.run("deposit", async () => {
      setDepositError(null);

      setDepositStatus("Adding money to your savings…");

      try {
        const result =
          await submitVaultDeposit({
            allowance: positionState.position.allowance,

            assets: parsedAmount.assets,

            approval,

            deposit,

            beforeSend: async () => ensureTransactionNetwork(),

            sender,

            receipts: {
              waitForTransactionReceipt: async ({ hash }) => {
                const receipt = await publicClient.waitForTransactionReceipt({
                  hash,
                });

                return {
                  status: receipt.status === "success" ? "success" : "reverted",
                };
              },
            },
          });

        setDepositAmount("");

        if (api) {
          await api.recordTransaction(
            {
              type:
                "SAVINGS_DEPOSIT",

              amountAtomic:
                parsedAmount.assets
                  .toString(),

              asset:
                "USDC",

              description:
                "Added to savings",

              chainId:
                config.chainId
                  .toString(),

              transactionHash:
                result.depositHash,

              externalReference:
                result.depositHash,
            },
            result.depositHash,
          );
        }

        setDepositStatus("Money added to your savings.");

        succeeded = true;

        void Promise.allSettled([
          refreshPosition(),

          refreshProductData(),

          refreshSavingsPerformance(),

          refreshSavingsMarketStatus(),
        ]);
      } catch (error) {
        diagnostics.warn("vault.deposit_failed", error);

        setDepositStatus(null);

        setDepositError(
          consumerErrorMessage(
            error,
            "We could not add your money. Try again.",
          ),
        );
      }
    });

    return acquired && succeeded;
  }, [
    account,
    api,
    config,
    depositAmount,
    depositQuoteState,
    ensureTransactionNetwork,
    positionState,
    publicClient,
    refreshPosition,
    refreshProductData,
    refreshSavingsMarketStatus,
    refreshSavingsPerformance,
    sender,
    transactionCoordinator,
  ]);
  const submitWithdrawal = useCallback(async (): Promise<boolean> => {
    if (
      !config ||
      !publicClient ||
      !account ||
      positionState.kind !== "ready"
    ) {
      setWithdrawError("Your Kept account is not ready yet.");

      return false;
    }

    const parsedAmount = parseUsdcDepositAmount(withdrawAmount);

    if ("error" in parsedAmount) {
      setWithdrawError(parsedAmount.error);

      return false;
    }

    if (parsedAmount.assets > positionState.position.withdrawableAssets) {
      setWithdrawError(
        "Enter an amount no greater than the amount currently available to withdraw.",
      );

      return false;
    }

    const withdrawal = buildVaultWithdrawTransaction({
      vault: config.vault,

      receiver: account,

      owner: account,

      assets: parsedAmount.assets,

      chainId: config.chainId,
    });

    let succeeded = false;

    const acquired = await transactionCoordinator.run("withdraw", async () => {
      setWithdrawError(null);

      setWithdrawStatus("Withdrawing...");

      try {
        const result =
          await submitVaultWithdrawal({
            withdrawal,

            beforeSend: async () => ensureTransactionNetwork(),

            sender,

            receipts: {
              waitForTransactionReceipt: async ({ hash }) => {
                const receipt = await publicClient.waitForTransactionReceipt({
                  hash,
                });

                return {
                  status: receipt.status === "success" ? "success" : "reverted",
                };
              },
            },
          });

        setWithdrawAmount("");

        if (api) {
          await api.recordTransaction(
            {
              type:
                "SAVINGS_WITHDRAWAL",

              amountAtomic:
                parsedAmount.assets
                  .toString(),

              asset:
                "USDC",

              description:
                "Moved to available cash",

              chainId:
                config.chainId
                  .toString(),

              transactionHash:
                result.withdrawalHash,

              externalReference:
                result.withdrawalHash,
            },
            result.withdrawalHash,
          );
        }

        setWithdrawStatus("Withdrawal complete.");

        succeeded = true;

        void Promise.allSettled([
          refreshPosition(),

          refreshProductData(),

          refreshSavingsPerformance(),

          refreshSavingsMarketStatus(),
        ]);
      } catch (error) {
        diagnostics.warn("vault.withdrawal_failed", error);

        setWithdrawStatus(null);

        setWithdrawError(
          consumerErrorMessage(
            error,
            "We could not complete your withdrawal. Try again.",
          ),
        );
      }
    });

    return acquired && succeeded;
  }, [
    account,
    api,
    config,
    ensureTransactionNetwork,
    positionState,
    publicClient,
    refreshPosition,
    refreshProductData,
    refreshSavingsMarketStatus,
    refreshSavingsPerformance,
    sender,
    transactionCoordinator,
    withdrawAmount,
  ]);
  const previewCryptoTransfer =
    useCallback(
      async () => {
        if (
          !account ||
          !config ||
          positionState.kind !==
          "ready"
        ) {
          setCryptoPreviewError(
            "Your Kept account is not ready yet.",
          );

          return;
        }

        const parsedAmount =
          parseUsdcDepositAmount(
            cryptoWithdrawAmount,
          );

        if (
          "error" in
          parsedAmount
        ) {
          setCryptoPreviewError(
            parsedAmount.error,
          );

          return;
        }

        if (
          parsedAmount.assets >
          positionState.position
            .withdrawableAssets
        ) {
          setCryptoPreviewError(
            "Enter an amount no greater than your available savings.",
          );

          return;
        }

        const destinationAsset =
          cryptoDestinationAssets.find(
            (
              asset,
            ) =>
              asset.assetId ===
              cryptoDestinationAssetId,
          );

        if (
          !destinationAsset
        ) {
          setCryptoPreviewError(
            "Choose a withdrawal network.",
          );

          return;
        }

        setCryptoPreviewing(
          true,
        );

        setCryptoPreviewReady(
          false,
        );

        setCryptoPreviewStatus(
          null,
        );

        setCryptoPreviewError(
          null,
        );

        try {
          const directMonadTransfer =
            destinationAsset.blockchain ===
            "monad";

          if (
            directMonadTransfer
          ) {
            setCryptoPreviewReady(
              true,
            );

            setCryptoPreviewStatus(
              "Transfer ready.",
            );

            return;
          }

          await ensureTransactionNetwork();

          const provider =
            await wallet.getProvider();

          if (
            !provider
          ) {
            throw new Error(
              "Wallet provider is unavailable.",
            );
          }

          const runner =
            createKeptIntentsRunner({
              sourceAddress:
                account,

              provider,
            });

          try {
            await previewCryptoWithdrawal({
              runner,
              amount:
                parsedAmount.assets,
              recipient:
                cryptoRecipient,
              destinationAsset,
            });

            setCryptoPreviewReady(
              true,
            );

            setCryptoPreviewStatus(
              "Transfer route ready.",
            );
          } finally {
            runner.dispose?.();
          }
        } catch (
        error
        ) {
          diagnostics.error(
            "withdrawal.crypto_preview_failed",
            error,
          );

          setCryptoPreviewError(
            consumerErrorMessage(
              error,
              "We could not prepare this transfer. Try again.",
            ),
          );
        } finally {
          setCryptoPreviewing(
            false,
          );
        }
      },
      [
        account,
        config,
        cryptoDestinationAssetId,
        cryptoDestinationAssets,
        cryptoRecipient,
        cryptoWithdrawAmount,
        ensureTransactionNetwork,
        positionState,
        wallet,
      ],
    );

  const executeCryptoTransfer =
    useCallback(
      async () => {
        if (
          !config ||
          !publicClient ||
          !account ||
          positionState.kind !==
          "ready"
        ) {
          setCryptoExecutionError(
            "Your Kept account is not ready yet.",
          );

          return;
        }

        if (
          !isAddress(
            cryptoRecipient,
          )
        ) {
          setCryptoExecutionError(
            "Enter a valid wallet address.",
          );

          return;
        }

        const parsedAmount =
          parseUsdcDepositAmount(
            cryptoWithdrawAmount,
          );

        if (
          "error" in
          parsedAmount
        ) {
          setCryptoExecutionError(
            parsedAmount.error,
          );

          return;
        }

        const availableCash =
          positionState.position
            .usdcBalance;

        const withdrawableSavings =
          positionState.position
            .withdrawableAssets;

        const availableToSend =
          positionState.position.usdcBalance +
          positionState.position.withdrawableAssets;

        if (
          parsedAmount.assets >
          availableToSend
        ) {
          setCryptoPreviewError(
            "Enter an amount no greater than your available balance.",
          );

          return;
        }

        const destinationAsset =
          cryptoDestinationAssets.find(
            (
              asset,
            ) =>
              asset.assetId ===
              cryptoDestinationAssetId,
          );

        if (
          !destinationAsset
        ) {
          setCryptoExecutionError(
            "Choose a withdrawal network.",
          );

          return;
        }

        if (
          !cryptoPreviewReady
        ) {
          setCryptoExecutionError(
            "Review the transfer before confirming it.",
          );

          return;
        }

        const recipient =
          getAddress(
            cryptoRecipient,
          );

        const requiredFromSavings =
          parsedAmount.assets >
            availableCash
            ? parsedAmount.assets -
            availableCash
            : 0n;

        setCryptoExecuting(
          true,
        );

        setCryptoExecutionError(
          null,
        );

        setCryptoExecutionStatus(
          requiredFromSavings > 0n
            ? "Preparing your money…"
            : "Preparing transfer…",
        );

        let savingsWithdrawn =
          false;

        try {
          await transactionCoordinator.run(
            "withdraw",
            async () => {
              /*
               * Stage 1:
               *
               * Only withdraw the amount that is not
               * already sitting in Available cash.
               */
              if (
                requiredFromSavings >
                0n
              ) {
                if (
                  requiredFromSavings >
                  withdrawableSavings
                ) {
                  throw new Error(
                    "There is not enough available savings for this transfer.",
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

                setCryptoExecutionStatus(
                  "Confirm the withdrawal from your savings.",
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
                              receipt.status ===
                                "success"
                                ? "success"
                                : "reverted",
                          };
                        },
                    },
                  });

                if (api) {
                  await api.recordTransaction(
                    {
                      type:
                        "SAVINGS_WITHDRAWAL",

                      amountAtomic:
                        requiredFromSavings
                          .toString(),

                      asset:
                        "USDC",

                      description:
                        "Moved to available cash",

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

                savingsWithdrawn =
                  true;

                setCryptoExecutionStatus(
                  "Savings withdrawn. Preparing transfer…",
                );
              }

              /*
               * Stage 2:
               *
               * Send the entire requested amount.
               *
               * Same-chain Monad USDC does not need
               * Aurora Intents.
               */
              const directMonadTransfer =
                destinationAsset
                  .blockchain ===
                "monad";

              if (
                directMonadTransfer
              ) {
                await ensureTransactionNetwork();

                const usdcAddress =
                  config.usdc;

                const hash =
                  await sender.sendTransaction({
                    to:
                      usdcAddress,

                    chainId:
                      config.chainId,

                    data:
                      encodeFunctionData({
                        abi:
                          erc20Abi,

                        functionName:
                          "transfer",

                        args: [
                          recipient,
                          parsedAmount.assets,
                        ],
                      }),
                  });

                setCryptoExecutionStatus(
                  "Transfer submitted. Waiting for confirmation…",
                );

                const receipt =
                  await publicClient
                    .waitForTransactionReceipt({
                      hash,
                    });

                if (
                  receipt.status !==
                  "success"
                ) {
                  throw new Error(
                    "The transfer did not complete successfully.",
                  );
                }

                return;
              }

              /*
               * Cross-chain route:
               *
               * Monad USDC in the embedded wallet
               * becomes the Aurora origin asset.
               */
              await ensureTransactionNetwork();

              const provider =
                await wallet.getProvider();

              if (
                !provider
              ) {
                throw new Error(
                  "Wallet provider is unavailable.",
                );
              }

              const runner =
                createKeptIntentsRunner({
                  sourceAddress:
                    account,

                  provider,
                });

              try {
                setCryptoExecutionStatus(
                  "Confirm the transfer in your wallet.",
                );

                const execution =
                  await executeCryptoWithdrawal({
                    runner,

                    amount:
                      parsedAmount.assets,

                    recipient,

                    destinationAsset,
                  });

                if (api) {
                  await api.recordTransaction(
                    {
                      type:
                        "CRYPTO_WITHDRAWAL",

                      amountAtomic:
                        parsedAmount.assets
                          .toString(),

                      asset:
                        destinationAsset.symbol,

                      description:
                        "Sent to external wallet",

                      chainId:
                        null,

                      transactionHash:
                        null,

                      externalReference:
                        execution.id
                    },
                    execution.id,
                  );
                }
              } finally {
                runner.dispose?.();
              }
            },
          );

          setCryptoExecutionStatus(
            "Transfer complete.",
          );

          setCryptoWithdrawAmount(
            "",
          );

          setCryptoPreviewReady(
            false,
          );

          setCryptoPreviewStatus(
            null,
          );

          await Promise.all([
            refreshPosition(),
            refreshProductData(),
          ]);
        } catch (
        error
        ) {
          diagnostics.warn(
            "withdrawal.crypto_execution_failed",
            error,
          );

          setCryptoExecutionStatus(
            null,
          );

          /*
           * This distinction is important.
           *
           * If the vault withdrawal succeeded,
           * the user's funds are not stuck or
           * lost. They're now simply Available
           * cash in the embedded wallet.
           */
          if (
            savingsWithdrawn
          ) {
            setCryptoExecutionError(
              "The transfer couldn't be completed. Your money was withdrawn from savings successfully and is now available in Kept.",
            );

            await Promise.all([
              refreshPosition(),
              refreshProductData(),
            ]);
          } else {
            setCryptoExecutionError(
              consumerErrorMessage(
                error,
                "We could not complete this transfer. Try again.",
              ),
            );
          }
        } finally {
          setCryptoExecuting(
            false,
          );
        }
      },
      [
        account,
        config,
        cryptoDestinationAssetId,
        cryptoDestinationAssets,
        cryptoPreviewReady,
        cryptoRecipient,
        cryptoWithdrawAmount,
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

  const startBankWithdrawal =
    useCallback(
      async () => {
        if (
          positionState.kind !==
          "ready"
        ) {
          setBankWithdrawError(
            "Your Kept account is not ready yet.",
          );

          return;
        }

        const parsed =
          parseUsdcDepositAmount(
            bankWithdrawAmount,
          );

        if (
          "error" in parsed ||
          parsed.assets <= 0n
        ) {
          setBankWithdrawError(
            "Enter a valid amount.",
          );

          return;
        }

        const available =
          positionState.position.usdcBalance +
          positionState.position.withdrawableAssets;

        if (
          parsed.assets >
          available
        ) {
          setBankWithdrawError(
            "Enter an amount no greater than your available balance.",
          );

          return;
        }

        const moonPayWindow =
          window.open(
            "about:blank",
            "_blank",
          );

        if (!moonPayWindow) {
          setBankWithdrawError(
            "Your browser blocked the MoonPay window. Allow popups and try again.",
          );

          return;
        }

        moonPayWindow.opener =
          null;

        setBankWithdrawSubmitting(
          true,
        );

        setBankWithdrawError(
          null,
        );

        setBankWithdrawStatus(
          "Preparing bank withdrawal…",
        );

        try {
          const accessToken =
            await session.getAccessToken();

          const response =
            await fetch(
              `${apiBaseUrl}/v1/moonpay/offramp-url`,
              {
                method:
                  "POST",

                headers: {
                  "content-type":
                    "application/json",

                  authorization:
                    `Bearer ${accessToken}`,

                  "ngrok-skip-browser-warning":
                    "true",
                },

                body:
                  JSON.stringify({
                    amount:
                      bankWithdrawAmount,
                  }),
              },
            );

          if (!response.ok) {
            const errorText =
              await response.text();

            throw new Error(
              `Could not prepare MoonPay: ${response.status} ${errorText}`,
            );
          }

          const result =
            await response.json() as {
              readonly url:
              string;
            };

          moonPayWindow.location.replace(
            result.url,
          );

          setBankWithdrawStatus(
            null,
          );
        } catch (error) {
          moonPayWindow.close();

          diagnostics.error(
            "withdrawal.moonpay_prepare_failed",
            error,
          );

          setBankWithdrawStatus(
            null,
          );

          setBankWithdrawError(
            consumerErrorMessage(
              error,
              "We couldn't prepare your bank withdrawal. Try again.",
            ),
          );
        } finally {
          setBankWithdrawSubmitting(
            false,
          );
        }
      },
      [
        apiBaseUrl,
        bankWithdrawAmount,
        positionState,
        session,
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

  const deleteGoal = useCallback(
    async (goal: GoalDto): Promise<boolean> => {
      if (
        !api ||
        !config ||
        !publicClient ||
        !account ||
        !commitmentManagerConfig
      ) {
        setDeleteGoalError("Your Kept account is not ready yet.");

        return false;
      }

      setDeletingGoal(true);

      setDeleteGoalError(null);

      setDeleteGoalStatus(null);

      let succeeded = false;

      const acquired = await transactionCoordinator.run(
        "commitment",

        async () => {
          try {
            await runGoalDeletion(
              goal,

              {
                commitments: productState.commitments,

                readOnchainStatus: async (commitment) => {
                  if (!commitment.onchainCommitmentId) {
                    throw new Error(
                      "Active commitment is missing its on-chain reference.",
                    );
                  }

                  const record = await publicClient.readContract({
                    address: commitmentManagerConfig.address,

                    abi: commitmentManagerAbi,

                    functionName: "commitments",

                    args: [BigInt(commitment.onchainCommitmentId)],
                  });

                  const rawStatus = record[6];

                  const status =
                    typeof rawStatus === "bigint"
                      ? Number(rawStatus)
                      : rawStatus;

                  switch (status) {
                    case 1:
                      return "ACTIVE";

                    case 2:
                      return "COMPLETED";

                    case 3:
                      return "FAILED";

                    case 4:
                      return "CANCELLED";

                    default:
                      throw new Error(
                        `Unknown on-chain commitment status: ${status}`,
                      );
                  }
                },

                cancelOnchain: async (commitment) => {
                  if (!commitment.onchainCommitmentId) {
                    throw new Error(
                      "Active commitment is missing its on-chain reference.",
                    );
                  }

                  await ensureTransactionNetwork();

                  const transactionHash = await sender.sendTransaction(
                    buildCancelCommitmentTransaction({
                      manager: commitmentManagerConfig.address,

                      chainId: config.chainId,

                      commitmentId: commitment.onchainCommitmentId,
                    }),
                  );

                  const receipt = await publicClient.waitForTransactionReceipt({
                    hash: transactionHash,

                    confirmations:
                      import.meta.env.VITE_ENABLE_LOCAL_ANVIL === "true"
                        ? 1
                        : 2,
                  });

                  if (receipt.status !== "success") {
                    throw new Error(
                      "Commitment cancellation transaction reverted.",
                    );
                  }
                },

                persistCancellation: async (commitment) => {
                  if (!commitment.onchainCommitmentId) {
                    throw new Error(
                      "Active commitment is missing its on-chain reference.",
                    );
                  }

                  await api.cancelCommitment(
                    commitment,

                    {
                      onchainCommitmentId: commitment.onchainCommitmentId,

                      owner: account,
                    },
                  );
                },

                archiveGoal: async (goalToArchive) => {
                  await api.archiveGoal(
                    goalToArchive.id,

                    globalThis.crypto.randomUUID(),
                  );
                },

                refresh: refreshProductData,

                onStage: (stage) => {
                  setDeleteGoalStatus(
                    {
                      cancelling: "Removing connected commitment…",

                      confirming: "Confirming removal of commitment…",

                      archiving: "Deleting goal…",
                    }[stage],
                  );
                },
              },
            );

            setDeleteGoalStatus(null);

            succeeded = true;
          } catch (error) {
            diagnostics.error(
              "api.goal_archive_failed",

              error,

              {
                goalId: goal.id,

                activeCommitments: productState.commitments.filter(
                  (commitment) =>
                    commitment.savingsGoalId === goal.id &&
                    commitment.state === "ACTIVE",
                ).length,
              },
            );

            setDeleteGoalStatus(null);

            setDeleteGoalError(
              consumerErrorMessage(
                error,

                "We could not delete this goal. Try again.",
              ),
            );
          }
        },
      );

      if (!acquired) {
        setDeleteGoalError(
          "Another account action is still being processed. Try again in a moment.",
        );
      }

      setDeletingGoal(false);

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

  const dismissGoalDeletion = useCallback(() => {
    setDeleteGoalError(null);

    setDeleteGoalStatus(null);
  }, []);

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

  const dismissDeposit = useCallback(() => {
    setDepositAmount("");

    setDepositStatus(null);

    setDepositError(null);

    setStoredDepositQuote({ kind: "idle" });
  }, []);

  const dismissWithdrawal = useCallback(() => {
    setWithdrawAmount("");

    setWithdrawStatus(null);

    setWithdrawError(null);
  }, []);

  const dismissGoal = useCallback(() => setGoalError(null), []);

  const dismissCommitment = useCallback(() => {
    setCommitmentError(null);

    setCommitmentStatus(null);
  }, []);

  const dismissAllocation = useCallback(() => {
    setAllocationError(null);

    setAllocationStatus(null);
  }, []);

  type RewardState =
    | { readonly kind: "loading" }
    | {
      readonly kind: "ready";

      readonly reward: CommitmentRewardState;
    }
    | {
      readonly kind: "error";

      readonly message: string;
    };

  const [rewardStates, setRewardStates] = useState<
    Readonly<Record<string, RewardState>>
  >({});

  const [claimingRewardId, setClaimingRewardId] = useState<string | null>(null);

  const [rewardClaimError, setRewardClaimError] = useState<{
    readonly commitmentId: string;

    readonly message: string;
  } | null>(null);

  const claimReward = useCallback(
    async (commitment: CommitmentDto): Promise<boolean> => {
      if (
        !config ||
        !commitmentManagerConfig ||
        !publicClient ||
        !account ||
        !commitment.onchainCommitmentId
      ) {
        setRewardClaimError({
          commitmentId: commitment.id,

          message: "Your Kept account is not ready yet.",
        });

        return false;
      }

      setRewardClaimError(null);

      setClaimingRewardId(commitment.id);

      let succeeded = false;

      const acquired = await transactionCoordinator.run(
        "commitment",

        async () => {
          try {
            await ensureTransactionNetwork();

            const result = await claimCommitmentReward({
              manager: commitmentManagerConfig.address,

              chainId: config.chainId,

              commitmentId: commitment.onchainCommitmentId!,

              sender,

              readContract: (request) =>
                publicClient.readContract(request as never),

              waitForReceipt: async (transactionHash) => {
                const receipt = await publicClient.waitForTransactionReceipt({
                  hash: transactionHash,

                  confirmations:
                    import.meta.env.VITE_ENABLE_LOCAL_ANVIL === "true" ? 1 : 2,
                });

                return {
                  status: receipt.status === "success" ? "success" : "reverted",
                };
              },
            });

            if (!result.ok) {
              throw result.error;
            }

            await Promise.all([
              refreshPosition(),

              refreshRewardStates(
                productState.kind === "ready"
                  ? productState.commitments
                  : [commitment],
              ),
            ]);

            succeeded = true;
          } catch (error) {
            diagnostics.warn(
              "commitment.reward_claim_failed",

              error,

              {
                commitmentId: commitment.id,

                onchainCommitmentId: commitment.onchainCommitmentId,
              },
            );

            setRewardClaimError({
              commitmentId: commitment.id,

              message: consumerErrorMessage(
                error,

                "We could not claim your reward. Try again.",
              ),
            });
          }
        },
      );

      if (!acquired) {
        setRewardClaimError({
          commitmentId: commitment.id,

          message:
            "Another account action is still being processed. Try again in a moment.",
        });
      }

      setClaimingRewardId(null);

      return succeeded;
    },

    [
      account,

      commitmentManagerConfig,

      config,

      ensureTransactionNetwork,

      productState,

      publicClient,

      refreshPosition,

      refreshRewardStates,

      sender,

      transactionCoordinator,
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

        positionState={positionState}

        goalFundingState={goalFundingState}

        productState={productState}

        savingsPerformanceState={savingsPerformanceState}

        savingsMarketStatusState={savingsMarketStatusState}

        onRefreshSavingsPerformance={() => void refreshSavingsPerformance()}

        onRefreshSavingsMarketStatus={() => void refreshSavingsMarketStatus()}

        stagingFaucetAvailable={config?.chainId === 10_143}

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

        onRefreshPosition={() => void refreshPosition()}

        onRefreshProductData={() => void refreshProductData()}

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

        onBankAmountChange={
          setBankWithdrawAmount
        }

        onStartBankWithdrawal={() =>
          void startBankWithdrawal()
        }
      />
    </AppShell>
  );
}
