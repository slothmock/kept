import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPublicClient, getAddress, http, isAddress } from "viem";

import { createKeptApi, readApiBaseUrl, type GoalDto } from "@/api/kept-api";
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
import { formatUsdc } from "@/features/savings/format";
import {
  allocationInputError,
  previewAllocationShares,
  readGoalFunding,
  type GoalFundingState,
} from "@/features/goals/funding";
import {
  clearPendingGoalAllocation,
  loadPendingGoalAllocation,
  savePendingGoalAllocation,
  type PendingGoalAllocation,
} from "@/features/goals/pending-allocation";
import {
  currentDepositQuote,
  type DepositQuoteState,
} from "@/features/savings/deposit-quote";
import { ConsumerError, consumerErrorMessage } from "@/lib/consumer-error";
import { diagnostics } from "@/lib/diagnostics";
import { createLatestRequestGate } from "@/lib/latest-request";
import { DashboardPage } from "@/pages/DashboardPage";
import { readCommitmentManagerConfig, readVaultConfig } from "@/vault/config";
import { minimumUsdcDepositError, parseUsdcDepositAmount } from "@/vault/deposit-input";
import { submitVaultDeposit, submitVaultWithdrawal } from "@/vault/executor";
import { readVaultDepositQuote } from "@/vault/fees";
import { readVaultPosition } from "@/vault/position";
import { getVaultTransactionCoordinator } from "@/vault/transaction-lock";
import { buildVaultDepositTransactions, buildVaultWithdrawTransaction } from "@/vault/transactions";

function fundingRefreshError(current: GoalFundingState, message: string): GoalFundingState {
  const funding = current.kind === "loading" ? undefined : current.funding;
  return funding ? { kind: "error", message, funding } : { kind: "error", message };
}

export function DashboardApp({ session }: { readonly session: Session }) {
  const [depositAmount, setDepositAmount] = useState("");
  const [depositStatus, setDepositStatus] = useState<string | null>(null);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [storedDepositQuote, setStoredDepositQuote] = useState<DepositQuoteState>({ kind: "idle" });
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawStatus, setWithdrawStatus] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [storedPositionState, setStoredPositionState] = useState<BoundPositionState>({ kind: "unavailable" });
  const [productState, setProductState] = useState<ProductDataState>(initialProductDataState);
  const [creatingGoal, setCreatingGoal] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [creatingCommitment, setCreatingCommitment] = useState(false);
  const [commitmentStatus, setCommitmentStatus] = useState<string | null>(null);
  const [commitmentError, setCommitmentError] = useState<string | null>(null);
  const [goalFundingState, setGoalFundingState] = useState<GoalFundingState>({ kind: "loading" });
  const [allocatingGoal, setAllocatingGoal] = useState(false);
  const [allocationStatus, setAllocationStatus] = useState<string | null>(null);
  const [allocationError, setAllocationError] = useState<string | null>(null);
  const allocationPending = useRef(false);
  const pendingAllocationAttempt = useRef<PendingGoalAllocation | null>(null);
  const pendingCommitmentAttempt = useRef<CommitmentCreationAttempt | null>(null);

  const wallet = useKeptEvmWallet();
  const sender = useKeptTransactionSender(wallet.address);
  const transactionCoordinator = useMemo(() => getVaultTransactionCoordinator(), []);
  const pendingTransaction = useSyncExternalStore(
    transactionCoordinator.subscribe,
    () => transactionCoordinator.pendingKind,
    () => null,
  );
  const positionRequestGate = useMemo(() => createLatestRequestGate(), []);
  const depositQuoteRequestGate = useMemo(() => createLatestRequestGate(), []);
  const productRequestGate = useMemo(() => createLatestRequestGate(), []);
  const config = useMemo(() => readVaultConfig(import.meta.env), []);
  const commitmentManagerConfig = useMemo(
    () => readCommitmentManagerConfig(import.meta.env),
    [],
  );
  const apiBaseUrl = useMemo(() => readApiBaseUrl(import.meta.env), []);
  const api = useMemo(
    () => apiBaseUrl ? createKeptApi({
      baseUrl: apiBaseUrl,
      getAccessToken: session.getAccessToken,
    }) : null,
    [apiBaseUrl, session.getAccessToken],
  );
  const publicClient = useMemo(
    () => config ? createPublicClient({ transport: http(config.rpcUrl) }) : null,
    [config],
  );
  const account = wallet.address && isAddress(wallet.address) ? getAddress(wallet.address) : null;

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
    const reconciled = reconcilePendingAttempt(attempt, productState.commitments);
    pendingCommitmentAttempt.current = reconciled;
    if (reconciled) {
      savePendingCommitmentAttempt(globalThis.localStorage, account, reconciled);
    } else {
      clearPendingCommitmentAttempt(globalThis.localStorage, account);
    }
  }, [account, productState]);
  const positionState: PositionState = currentPositionState(storedPositionState, {
    account,
    chainId: wallet.liveChainId,
  });
  const depositQuoteState = currentDepositQuote(storedDepositQuote, depositAmount);
  const getCurrentWalletChainId = wallet.getCurrentChainId;
  const ensureTransactionNetwork = useCallback(async () => {
    if (!config || !publicClient) {
      throw new ConsumerError("Savings are unavailable because Kept is not configured.", {
        code: "service_unavailable",
      });
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
        setStoredPositionState({ kind: "error", message: "Savings are unavailable because Kept is not configured." });
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
      if (wallet.liveChainId === null || wallet.liveChainId !== liveWalletChainId) {
        if (positionRequestGate.isCurrent(requestId)) {
          setStoredPositionState({
            kind: "error",
            message: "Your account's network is changing. Try again.",
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
          readContract: (input) => publicClient.readContract(input as never) as Promise<bigint>,
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
          message: consumerErrorMessage(error, "We could not refresh your savings. Try again."),
        });
      }
    }
  }, [account, config, getCurrentWalletChainId, positionRequestGate, publicClient, wallet.liveChainId]);

  const refreshProductData = useCallback(async () => {
    const requestId = productRequestGate.begin();
    setProductState(beginProductRefresh);
    setGoalFundingState((current) => current.kind === "ready" ? current : { kind: "loading" });
    if (!api) {
      if (productRequestGate.isCurrent(requestId)) {
        setProductState((current) => failProductRefresh(current, "Kept's service is not configured."));
        setGoalFundingState({ kind: "error", message: "Goal balances are unavailable because Kept is not configured." });
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
            message: "Goal balances are unavailable because Kept is not configured.",
          });
        }
        return;
      }
      try {
        const allocations = await Promise.all(goals.map((goal) => api.getGoalAllocation(goal.id)));
        const funding = await readGoalFunding({
          allocations,
          publicClient: {
            readContract: (input) => publicClient.readContract(input as never) as Promise<bigint>,
          },
          vault: config.vault,
        });
        if (productRequestGate.isCurrent(requestId)) {
          setGoalFundingState({ kind: "ready", funding });
        }
      } catch (error) {
        if (productRequestGate.isCurrent(requestId)) {
          diagnostics.error("api.goal_funding_refresh_failed", error);
          setGoalFundingState((current) => fundingRefreshError(
            current,
            "We could not reconcile your goal balances. Refresh before assigning more savings.",
          ));
        }
      }
    } catch (error) {
      if (productRequestGate.isCurrent(requestId)) {
        diagnostics.error("api.product_refresh_failed", error);
        setProductState((current) => failProductRefresh(
          current,
          consumerErrorMessage(error, "We could not refresh your goals and commitments. Try again."),
        ));
        setGoalFundingState((current) => fundingRefreshError(
          current,
          "We could not refresh your goal balances. Try again.",
        ));
      }
    }
  }, [api, config, productRequestGate, publicClient]);

  useEffect(() => {
    const requestId = depositQuoteRequestGate.begin();
    const parsedAmount = parseUsdcDepositAmount(depositAmount);
    if (
      "error" in parsedAmount
      || minimumUsdcDepositError(parsedAmount.assets)
      || !config
      || !publicClient
      || positionState.kind !== "ready"
    ) {
      setStoredDepositQuote({ kind: "idle" });
      return;
    }

    setStoredDepositQuote({ kind: "loading" });
    void readVaultDepositQuote({
      assets: parsedAmount.assets,
      vault: config.vault,
      publicClient: {
        readContract: (input) => publicClient.readContract(input as never) as Promise<bigint>,
      },
    }).then((quote) => {
      if (depositQuoteRequestGate.isCurrent(requestId)) {
        setStoredDepositQuote({ kind: "ready", quote });
      }
    }).catch((error) => {
      if (depositQuoteRequestGate.isCurrent(requestId)) {
        diagnostics.error("vault.deposit_quote_failed", error);
        setStoredDepositQuote({
          kind: "error",
          assets: parsedAmount.assets,
          message: consumerErrorMessage(error, "We could not calculate the fees. Try again."),
        });
      }
    });
  }, [config, depositAmount, depositQuoteRequestGate, positionState.kind, publicClient]);

  useEffect(() => {
    void refreshPosition();
    void refreshProductData();
  }, [refreshPosition, refreshProductData]);

  const submitDeposit = useCallback(async () => {
    if (!config || !publicClient || !account || positionState.kind !== "ready") {
      setDepositError("Your Kept account is not ready yet.");
      return;
    }

    const parsedAmount = parseUsdcDepositAmount(depositAmount);
    if ("error" in parsedAmount) {
      setDepositError(parsedAmount.error);
      return;
    }
    const minimumError = minimumUsdcDepositError(parsedAmount.assets);
    if (minimumError) {
      setDepositError(minimumError);
      return;
    }
    if (depositQuoteState.kind !== "ready" || depositQuoteState.quote.assets !== parsedAmount.assets) {
      setDepositError("Wait for the fee details before adding money.");
      return;
    }
    if (parsedAmount.assets > positionState.position.usdcBalance) {
      setDepositError("Enter an amount no greater than your available USDC.");
      return;
    }

    const [approval, deposit] = buildVaultDepositTransactions({
      usdc: config.usdc,
      vault: config.vault,
      receiver: account,
      assets: parsedAmount.assets,
      chainId: config.chainId,
    });

    await transactionCoordinator.run("deposit", async () => {
      setDepositError(null);
      setDepositStatus("Confirm the transaction in your wallet.");
      try {
        const result = await submitVaultDeposit({
          allowance: positionState.position.allowance,
          assets: parsedAmount.assets,
          approval,
          deposit,
          beforeSend: async () => ensureTransactionNetwork(),
          sender,
          receipts: {
            waitForTransactionReceipt: async ({ hash }) => {
              const receipt = await publicClient.waitForTransactionReceipt({ hash });
              return { status: receipt.status === "success" ? "success" : "reverted" };
            },
          },
        });
        setDepositStatus(result.approvalHash
          ? "USDC approved and added. Refreshing your balance…"
          : "USDC added. Refreshing your balance…");
        setDepositAmount("");
        await Promise.all([refreshPosition(), refreshProductData()]);
        setDepositStatus("Deposit confirmed.");
      } catch (error) {
        diagnostics.warn("vault.deposit_failed", error);
        setDepositStatus(null);
        setDepositError(consumerErrorMessage(error, "We could not add your money. Try again."));
      }
    });
  }, [account, config, depositAmount, depositQuoteState, ensureTransactionNetwork, positionState, publicClient, refreshPosition, refreshProductData, sender, transactionCoordinator]);

  const submitWithdrawal = useCallback(async () => {
    if (!config || !publicClient || !account || positionState.kind !== "ready") {
      setWithdrawError("Your Kept account is not ready yet.");
      return;
    }

    const parsedAmount = parseUsdcDepositAmount(withdrawAmount);
    if ("error" in parsedAmount) {
      setWithdrawError(parsedAmount.error);
      return;
    }
    if (parsedAmount.assets > positionState.position.withdrawableAssets) {
      setWithdrawError("Enter an amount no greater than the amount currently available to withdraw.");
      return;
    }

    const withdrawal = buildVaultWithdrawTransaction({
      vault: config.vault,
      receiver: account,
      owner: account,
      assets: parsedAmount.assets,
      chainId: config.chainId,
    });

    await transactionCoordinator.run("withdraw", async () => {
      setWithdrawError(null);
      setWithdrawStatus("Confirm the withdrawal in your wallet.");
      try {
        await submitVaultWithdrawal({
          withdrawal,
          beforeSend: async () => ensureTransactionNetwork(),
          sender,
          receipts: {
            waitForTransactionReceipt: async ({ hash }) => {
              const receipt = await publicClient.waitForTransactionReceipt({ hash });
              return { status: receipt.status === "success" ? "success" : "reverted" };
            },
          },
        });
        setWithdrawStatus("Withdrawal confirmed. Refreshing your balance…");
        setWithdrawAmount("");
        await Promise.all([refreshPosition(), refreshProductData()]);
        setWithdrawStatus("Withdrawal confirmed.");
      } catch (error) {
        diagnostics.warn("vault.withdrawal_failed", error);
        setWithdrawStatus(null);
        setWithdrawError(consumerErrorMessage(error, "We could not complete your withdrawal. Try again."));
      }
    });
  }, [account, config, ensureTransactionNetwork, positionState, publicClient, refreshPosition, refreshProductData, sender, transactionCoordinator, withdrawAmount]);

  const createGoal = useCallback(async (input: {
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
      setGoalError(consumerErrorMessage(error, "We could not create your goal. Try again."));
      return false;
    } finally {
      setCreatingGoal(false);
    }
  }, [api, refreshProductData]);

  const addToGoal = useCallback(async (goal: GoalDto, amount: string): Promise<boolean> => {
    if (allocationPending.current) {
      setAllocationError("An allocation request is already in progress.");
      return false;
    }
    if (!api || !config || !publicClient || !account || goalFundingState.kind !== "ready") {
      setAllocationError("Your goal balances are not ready yet. Refresh and try again.");
      return false;
    }
    const parsed = parseUsdcDepositAmount(amount);
    if ("error" in parsed || parsed.assets <= 0n) {
      setAllocationError("Enter a valid amount greater than zero.");
      return false;
    }

    allocationPending.current = true;
    setAllocatingGoal(true);
    setAllocationError(null);
    setAllocationStatus("Checking your available savings…");
    try {
      await ensureTransactionNetwork();
      const assetsAtomic = parsed.assets.toString();
      const inMemoryAttempt = pendingAllocationAttempt.current;
      const storedAttempt = inMemoryAttempt?.account.toLowerCase() === account.toLowerCase()
        ? inMemoryAttempt
        : loadPendingGoalAllocation(globalThis.localStorage, account);
      const matchingAttempt = storedAttempt?.account.toLowerCase() === account.toLowerCase()
        && storedAttempt.goalId === goal.id
        && storedAttempt.assetsAtomic === assetsAtomic
        ? storedAttempt
        : null;
      if (storedAttempt && !matchingAttempt) {
        setAllocationStatus(null);
        setAllocationError(
          `A previous ${formatUsdc(BigInt(storedAttempt.assetsAtomic))} USDC request still needs confirmation. Retry that amount on the same goal first.`,
        );
        return false;
      }
      const requiredShares = matchingAttempt
        ? BigInt(matchingAttempt.sharesAtomic)
        : await previewAllocationShares({
          assets: parsed.assets,
          publicClient: {
            readContract: (input) => publicClient.readContract(input as never) as Promise<bigint>,
          },
          vault: config.vault,
        });
      const validationError = matchingAttempt ? null : allocationInputError(
        parsed.assets,
        requiredShares,
        goalFundingState.funding.unallocatedShares,
      );
      if (validationError) {
        setAllocationStatus(null);
        setAllocationError(validationError);
        return false;
      }

      setAllocationStatus("Adding savings to your goal…");
      const sharesAtomic = requiredShares.toString();
      const attempt = matchingAttempt
        ? matchingAttempt
        : {
          account,
          goalId: goal.id,
          assetsAtomic,
          sharesAtomic,
          idempotencyKey: globalThis.crypto.randomUUID(),
        };
      pendingAllocationAttempt.current = attempt;
      if (!savePendingGoalAllocation(globalThis.localStorage, attempt)) {
        pendingAllocationAttempt.current = null;
        setAllocationStatus(null);
        setAllocationError("Kept could not safely prepare this request in your browser. Check storage permissions and try again.");
        return false;
      }
      await api.allocateGoalShares(goal.id, {
        shareDeltaAtomic: sharesAtomic,
        reason: "manual",
      }, attempt.idempotencyKey);
      pendingAllocationAttempt.current = null;
      clearPendingGoalAllocation(globalThis.localStorage, account);
      await refreshProductData();
      setAllocationStatus(null);
      return true;
    } catch (error) {
      diagnostics.error("api.goal_allocation_failed", error);
      setAllocationStatus(null);
      setAllocationError(consumerErrorMessage(
        error,
        "We could not add those savings to your goal. Refresh and try again.",
      ));
      return false;
    } finally {
      allocationPending.current = false;
      setAllocatingGoal(false);
    }
  }, [account, api, config, ensureTransactionNetwork, goalFundingState, publicClient, refreshProductData]);

  const createCommitment = useCallback(async (goal: GoalDto, input: CreateCommitmentInput) => {
    if (!api || !config || !commitmentManagerConfig || !publicClient || !account) {
      setCommitmentError("Commitments are unavailable because Kept is not configured.");
      return false;
    }

    const parsed = parseUsdcDepositAmount(input.target);
    if ("error" in parsed || parsed.assets <= 0n) {
      setCommitmentError("Enter a valid weekly savings amount.");
      return false;
    }
    const parameters = { targetAmountAtomic: parsed.assets.toString(), periodDays: 7 };
    const draftInput = {
      goalId: goal.id,
      definition: { code: input.code, version: 1 },
      parameters,
      epochStart: input.startAt.toISOString(),
      epochEnd: input.endAt.toISOString(),
      verificationDeadline: input.verificationDeadline.toISOString(),
    };
    const recoverableDraft = productState.commitments.find((commitment) =>
      commitment.state === "DRAFT"
      && commitment.savingsGoalId === goal.id
      && commitment.definition.code === input.code
      && commitment.parameters.targetAmountAtomic === parameters.targetAmountAtomic
    );
    const existingAttempt = pendingCommitmentAttempt.current
      ?? (recoverableDraft ? {
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
      } : null);
    if (existingAttempt?.terminalFailure) {
      setCommitmentError(
        "Kept could not safely reconcile this confirmed commitment. Contact support before trying again.",
      );
      return false;
    }
    if (
      existingAttempt
      && (
        existingAttempt.draftInput.goalId !== goal.id
        || existingAttempt.draftInput.definition.code !== input.code
        || existingAttempt.draftInput.parameters.targetAmountAtomic !== parameters.targetAmountAtomic
      )
    ) {
      setCommitmentError("Finish retrying your pending commitment before creating a different one.");
      return false;
    }

    setCreatingCommitment(true);
    setCommitmentError(null);
    let succeeded = false;
    const acquired = await transactionCoordinator.run("commitment", async () => {
      const result = await runCommitmentCreation(existingAttempt, {
        draftInput,
        draftIdempotencyKey: existingAttempt?.draftIdempotencyKey
          ?? globalThis.crypto.randomUUID(),
        createDraft: (request, idempotencyKey) => api.createCommitment(
          request,
          idempotencyKey,
        ),
        sendTransaction: async (draft) => {
          await ensureTransactionNetwork();
          return sender.sendTransaction(buildCreateCommitmentTransaction({
            manager: commitmentManagerConfig.address,
            chainId: config.chainId,
            referenceId: referenceIdForCommitment(draft.id),
            startAt: timestampSeconds(draft.epochStart),
            endAt: timestampSeconds(draft.epochEnd),
          }));
        },
        confirmTransaction: async (draft, transactionHash) => {
          const receipt = await publicClient.waitForTransactionReceipt({
            hash: transactionHash,
            confirmations:
              import.meta.env.VITE_ENABLE_LOCAL_ANVIL === "true"
                ? 1
                : 2,
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
            readContract: (request) => publicClient.readContract(request as never),
          });
        },
        activateDraft: async (draft, settlement) => {
          const result = await api.activateCommitment(draft, {
            onchainCommitmentId: settlement.commitmentId.toString(),
            transactionHash: settlement.transactionHash,
          });

          return result;
        },
        onStage: (stage) => setCommitmentStatus({
          draft: "Preparing your commitment…",
          wallet: "Confirm your commitment in your account.",
          confirmation: "Confirming your commitment…",
          activation: "Finishing your commitment…",
        }[stage]),
        onAttempt: (attempt) => {
          pendingCommitmentAttempt.current = attempt;
          if (!savePendingCommitmentAttempt(globalThis.localStorage, account, attempt)) {
            throw new Error("Local commitment recovery state could not be saved");
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
                ? "Your commitment is confirmed, but Kept could not finish syncing it. Try again."
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
      setCommitmentStatus("Commitment confirmed. Refreshing…");
      await refreshProductData();
      setCommitmentStatus(null);
      succeeded = true;
    });
    setCreatingCommitment(false);
    if (!acquired) {
      setCommitmentStatus(null);
      setCommitmentError("Another account request is already in progress.");
    }
    return succeeded;
  }, [account, api, commitmentManagerConfig, config, ensureTransactionNetwork, productState.commitments, publicClient, refreshProductData, sender, transactionCoordinator]);

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

  if (!session.isReady) {
    return <main className="grid min-h-screen place-items-center text-sm text-muted-foreground" aria-live="polite">Preparing your account…</main>;
  }

  return (
    <AppShell
      headerAction={wallet.address ? <AccountMenu address={wallet.address} onSignOut={session.logout} /> : undefined}
    >
      <DashboardPage
        walletAddress={wallet.address}
        positionState={positionState}
        goalFundingState={goalFundingState}
        productState={productState}
        depositAmount={depositAmount}
        depositStatus={depositStatus}
        depositError={depositError}
        depositQuoteState={depositQuoteState}
        withdrawAmount={withdrawAmount}
        withdrawStatus={withdrawStatus}
        withdrawError={withdrawError}
        pendingTransaction={pendingTransaction}
        creatingGoal={creatingGoal}
        goalError={goalError}
        creatingCommitment={creatingCommitment}
        commitmentStatus={commitmentStatus}
        commitmentError={commitmentError}
        allocatingGoal={allocatingGoal}
        allocationStatus={allocationStatus}
        allocationError={allocationError}
        onDepositAmountChange={setDepositAmount}
        onSubmitDeposit={() => void submitDeposit()}
        onDismissDeposit={dismissDeposit}
        onWithdrawAmountChange={setWithdrawAmount}
        onSubmitWithdrawal={() => void submitWithdrawal()}
        onDismissWithdrawal={dismissWithdrawal}
        onRefreshPosition={() => void refreshPosition()}
        onRefreshProductData={() => void refreshProductData()}
        onCreateGoal={createGoal}
        onCreateCommitment={createCommitment}
        onAddToGoal={addToGoal}
        onDismissGoal={dismissGoal}
        onDismissCommitment={dismissCommitment}
        onDismissAllocation={dismissAllocation}
      />
    </AppShell>
  );
}
