import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPublicClient, getAddress, http, isAddress } from "viem";

import { createKeptApi, readApiBaseUrl, type GoalDto } from "@/api/kept-api";
import { type Session } from "@/auth/session";
import { useKeptEvmWallet } from "@/chain/evm-wallet";
import { checkNetworkReadiness } from "@/chain/network-readiness";
import { useKeptTransactionSender } from "@/chain/transaction-sender";
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
import {
  currentDepositQuote,
  type DepositQuoteState,
} from "@/features/savings/deposit-quote";
import { ConsumerError, consumerErrorMessage } from "@/lib/consumer-error";
import { diagnostics } from "@/lib/diagnostics";
import { createLatestRequestGate } from "@/lib/latest-request";
import { DashboardPage } from "@/pages/DashboardPage";
import { readVaultConfig } from "@/vault/config";
import { minimumUsdcDepositError, parseUsdcDepositAmount } from "@/vault/deposit-input";
import { submitVaultDeposit, submitVaultWithdrawal } from "@/vault/executor";
import { readVaultDepositQuote } from "@/vault/fees";
import { readVaultPosition } from "@/vault/position";
import { getVaultTransactionCoordinator } from "@/vault/transaction-lock";
import { buildVaultDepositTransactions, buildVaultWithdrawTransaction } from "@/vault/transactions";

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
  const [commitmentError, setCommitmentError] = useState<string | null>(null);

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
    if (!api) {
      if (productRequestGate.isCurrent(requestId)) {
        setProductState((current) => failProductRefresh(current, "Kept's service is not configured."));
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
    } catch (error) {
      if (productRequestGate.isCurrent(requestId)) {
        diagnostics.error("api.product_refresh_failed", error);
        setProductState((current) => failProductRefresh(
          current,
          consumerErrorMessage(error, "We could not refresh your goals and commitments. Try again."),
        ));
      }
    }
  }, [api, productRequestGate]);

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
        await refreshPosition();
        setDepositStatus("Deposit confirmed.");
      } catch (error) {
        diagnostics.warn("vault.deposit_failed", error);
        setDepositStatus(null);
        setDepositError(consumerErrorMessage(error, "We could not add your money. Try again."));
      }
    });
  }, [account, config, depositAmount, depositQuoteState, ensureTransactionNetwork, positionState, publicClient, refreshPosition, sender, transactionCoordinator]);

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
        await refreshPosition();
        setWithdrawStatus("Withdrawal confirmed.");
      } catch (error) {
        diagnostics.warn("vault.withdrawal_failed", error);
        setWithdrawStatus(null);
        setWithdrawError(consumerErrorMessage(error, "We could not complete your withdrawal. Try again."));
      }
    });
  }, [account, config, ensureTransactionNetwork, positionState, publicClient, refreshPosition, sender, transactionCoordinator, withdrawAmount]);

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

  const createCommitment = useCallback(async (goal: GoalDto, input: CreateCommitmentInput) => {
    if (!api) {
      setCommitmentError("Kept's service is not configured.");
      return false;
    }

    const parsed = parseUsdcDepositAmount(input.target);
    if ("error" in parsed || parsed.assets <= 0n) {
      setCommitmentError("Enter a valid weekly savings amount.");
      return false;
    }
    const parameters = { targetAmountAtomic: parsed.assets.toString(), periodDays: 7 };

    setCreatingCommitment(true);
    setCommitmentError(null);
    try {
      const draft = await api.createCommitment({
        goalId: goal.id,
        definition: { code: input.code, version: 1 },
        parameters,
        epochStart: input.startAt.toISOString(),
        epochEnd: input.endAt.toISOString(),
        verificationDeadline: input.verificationDeadline.toISOString(),
      });
      await api.activateCommitment(draft);
      await refreshProductData();
      return true;
    } catch (error) {
      diagnostics.error("api.commitment_create_failed", error);
      setCommitmentError(consumerErrorMessage(error, "We could not create your commitment. Try again."));
      return false;
    } finally {
      setCreatingCommitment(false);
    }
  }, [api, refreshProductData]);

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
  const dismissCommitment = useCallback(() => setCommitmentError(null), []);

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
        commitmentError={commitmentError}
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
        onDismissGoal={dismissGoal}
        onDismissCommitment={dismissCommitment}
      />
    </AppShell>
  );
}
