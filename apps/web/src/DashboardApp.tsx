import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPublicClient, getAddress, http, isAddress } from "viem";

import { createKeptApi, readApiBaseUrl, type GoalDto } from "@/api/kept-api";
import { type Session } from "@/auth/session";
import { useKeptEvmWallet } from "@/chain/evm-wallet";
import { useKeptTransactionSender } from "@/chain/transaction-sender";
import { AccountMenu } from "@/components/AccountMenu";
import { AppShell } from "@/components/AppShell";
import type { CreateCommitmentInput } from "@/features/commitments/CreateCommitmentDialog";
import type { PositionState } from "@/features/savings/BalanceCard";
import { createLatestRequestGate } from "@/lib/latest-request";
import { DashboardPage, type ProductDataState } from "@/pages/DashboardPage";
import { readVaultConfig } from "@/vault/config";
import { parseUsdcDepositAmount } from "@/vault/deposit-input";
import { submitVaultDeposit, submitVaultWithdrawal } from "@/vault/executor";
import { readVaultPosition } from "@/vault/position";
import { getVaultTransactionCoordinator } from "@/vault/transaction-lock";
import { buildVaultDepositTransactions, buildVaultWithdrawTransaction } from "@/vault/transactions";

function displayError(error: unknown): string {
  return error instanceof Error ? error.message : "We could not complete that request.";
}

export function DashboardApp({ session }: { readonly session: Session }) {
  const [depositAmount, setDepositAmount] = useState("");
  const [depositStatus, setDepositStatus] = useState<string | null>(null);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawStatus, setWithdrawStatus] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [positionState, setPositionState] = useState<PositionState>({ kind: "unavailable" });
  const [productState, setProductState] = useState<ProductDataState>({ kind: "loading" });
  const [creatingGoal, setCreatingGoal] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [creatingCommitment, setCreatingCommitment] = useState(false);
  const [commitmentError, setCommitmentError] = useState<string | null>(null);

  const wallet = useKeptEvmWallet();
  const sender = useKeptTransactionSender();
  const transactionCoordinator = useMemo(() => getVaultTransactionCoordinator(), []);
  const pendingTransaction = useSyncExternalStore(
    transactionCoordinator.subscribe,
    () => transactionCoordinator.pendingKind,
    () => null,
  );
  const positionRequestGate = useMemo(() => createLatestRequestGate(), []);
  const config = useMemo(() => readVaultConfig(import.meta.env), []);
  const api = useMemo(
    () => createKeptApi({
      baseUrl: readApiBaseUrl(import.meta.env),
      getAccessToken: session.getAccessToken,
    }),
    [session.getAccessToken],
  );
  const publicClient = useMemo(
    () => config ? createPublicClient({ transport: http(config.rpcUrl) }) : null,
    [config],
  );
  const account = wallet.address && isAddress(wallet.address) ? getAddress(wallet.address) : null;

  const refreshPosition = useCallback(async () => {
    const requestId = positionRequestGate.begin();
    if (!config || !publicClient || !account) {
      if (positionRequestGate.isCurrent(requestId)) {
        setPositionState({ kind: "unavailable" });
      }
      return;
    }

    setPositionState({ kind: "loading" });
    try {
      const position = await readVaultPosition({
        publicClient: {
          readContract: (input) => publicClient.readContract(input as never) as Promise<bigint>,
        },
        usdc: config.usdc,
        vault: config.vault,
        account,
      });
      if (positionRequestGate.isCurrent(requestId)) {
        setPositionState({ kind: "ready", position });
      }
    } catch (error) {
      if (positionRequestGate.isCurrent(requestId)) {
        setPositionState({ kind: "error", message: displayError(error) });
      }
    }
  }, [account, config, positionRequestGate, publicClient]);

  const refreshProductData = useCallback(async () => {
    setProductState((current) => current.kind === "loading" ? current : { kind: "loading" });
    try {
      const [goals, commitments] = await Promise.all([
        api.listGoals(),
        api.listCommitments(),
      ]);
      setProductState({ kind: "ready", goals, commitments });
    } catch (error) {
      setProductState((current) => ({
        kind: "error",
        message: displayError(error),
        goals: current.kind === "ready" || current.kind === "error" ? current.goals : [],
        commitments: current.kind === "ready" || current.kind === "error" ? current.commitments : [],
      }));
    }
  }, [api]);

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
        setDepositStatus(null);
        setDepositError(displayError(error));
      }
    });
  }, [account, config, depositAmount, positionState, publicClient, refreshPosition, sender, transactionCoordinator]);

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
        setWithdrawStatus(null);
        setWithdrawError(displayError(error));
      }
    });
  }, [account, config, positionState, publicClient, refreshPosition, sender, transactionCoordinator, withdrawAmount]);

  const createGoal = useCallback(async (input: {
    readonly name: string;
    readonly targetAmount: string;
    readonly targetDate: string | null;
  }) => {
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
      setGoalError(displayError(error));
      return false;
    } finally {
      setCreatingGoal(false);
    }
  }, [api, refreshProductData]);

  const createCommitment = useCallback(async (goal: GoalDto, input: CreateCommitmentInput) => {
    let parameters: Readonly<Record<string, unknown>>;

    if (input.code === "WEEKLY_SAVINGS_V1") {
      const parsed = parseUsdcDepositAmount(input.target);
      if ("error" in parsed || parsed.assets <= 0n) {
        setCommitmentError("Enter a valid weekly savings amount.");
        return false;
      }
      parameters = { targetAmountAtomic: parsed.assets.toString(), periodDays: 7 };
    } else {
      const count = Number(input.target);
      if (!Number.isSafeInteger(count) || count <= 0) {
        setCommitmentError("Enter a whole number of activities greater than zero.");
        return false;
      }
      parameters = { targetCount: count, periodDays: 7 };
    }

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
      setCommitmentError(displayError(error));
      return false;
    } finally {
      setCreatingCommitment(false);
    }
  }, [api, refreshProductData]);

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
        onWithdrawAmountChange={setWithdrawAmount}
        onSubmitWithdrawal={() => void submitWithdrawal()}
        onRefreshPosition={() => void refreshPosition()}
        onRefreshProductData={() => void refreshProductData()}
        onCreateGoal={createGoal}
        onCreateCommitment={createCommitment}
      />
    </AppShell>
  );
}
