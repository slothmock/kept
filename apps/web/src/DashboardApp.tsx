import { useCallback, useEffect, useMemo, useState } from "react";
import { createPublicClient, getAddress, http, isAddress } from "viem";

import { AppShell } from "./components/AppShell.js";
import { useKeptEvmWallet } from "./kept-evm-wallet.js";
import { useKeptTransactionSender } from "./kept-transaction-sender.js";
import { DashboardScreen } from "./screens/DashboardScreen.js";
import type { Session } from "./session.js";
import { readVaultConfig } from "./vault-config.js";
import { parseUsdcDepositAmount } from "./vault-deposit-input.js";
import { submitVaultDeposit, submitVaultWithdrawal } from "./vault-executor.js";
import { readVaultPosition, type VaultPosition } from "./vault-position.js";
import { buildVaultDepositTransactions, buildVaultWithdrawTransaction } from "./vault-transactions.js";

type PositionState =
  | { readonly kind: "unavailable" }
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly position: VaultPosition }
  | { readonly kind: "error"; readonly message: string };

function displayError(error: unknown): string {
  return error instanceof Error ? error.message : "We could not confirm your vault position.";
}

export function DashboardApp({ session }: { readonly session: Session }) {
  const [fundingOpen, setFundingOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositStatus, setDepositStatus] = useState<string | null>(null);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawStatus, setWithdrawStatus] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [positionState, setPositionState] = useState<PositionState>({ kind: "unavailable" });
  const wallet = useKeptEvmWallet();
  const sender = useKeptTransactionSender();
  const config = useMemo(() => readVaultConfig(import.meta.env), []);
  const publicClient = useMemo(
    () => config ? createPublicClient({ transport: http(config.rpcUrl) }) : null,
    [config],
  );
  const account = wallet.address && isAddress(wallet.address) ? getAddress(wallet.address) : null;

  const refreshPosition = useCallback(async () => {
    if (!config || !publicClient || !account) {
      setPositionState({ kind: "unavailable" });
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
      setPositionState({ kind: "ready", position });
    } catch (error) {
      setPositionState({ kind: "error", message: displayError(error) });
    }
  }, [account, config, publicClient]);

  useEffect(() => {
    void refreshPosition();
  }, [refreshPosition]);

  const submitDeposit = useCallback(async () => {
    if (!config || !publicClient || !account || positionState.kind !== "ready") {
      setDepositError("Your local vault account is not ready yet.");
      return;
    }

    const parsedAmount = parseUsdcDepositAmount(depositAmount);
    if ("error" in parsedAmount) {
      setDepositError(parsedAmount.error);
      return;
    }
    if (parsedAmount.assets > positionState.position.usdcBalance) {
      setDepositError("Enter an amount no greater than your available test USDC.");
      return;
    }

    setDepositError(null);
    setDepositStatus("Confirm the transaction in your wallet.");
    const [approval, deposit] = buildVaultDepositTransactions({
      usdc: config.usdc,
      vault: config.vault,
      receiver: account,
      assets: parsedAmount.assets,
      chainId: config.chainId,
    });

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
        ? "Test USDC approved and deposited. Refreshing your balance…"
        : "Test USDC deposited. Refreshing your balance…");
      setDepositAmount("");
      await refreshPosition();
      setDepositStatus("Deposit confirmed.");
    } catch (error) {
      setDepositStatus(null);
      setDepositError(displayError(error));
    }
  }, [account, config, depositAmount, positionState, publicClient, refreshPosition, sender]);

  const submitWithdrawal = useCallback(async () => {
    if (!config || !publicClient || !account || positionState.kind !== "ready") {
      setWithdrawError("Your local vault account is not ready yet.");
      return;
    }

    const parsedAmount = parseUsdcDepositAmount(withdrawAmount);
    if ("error" in parsedAmount) {
      setWithdrawError(parsedAmount.error);
      return;
    }
    if (parsedAmount.assets > positionState.position.assets) {
      setWithdrawError("Enter an amount no greater than your confirmed savings balance.");
      return;
    }

    setWithdrawError(null);
    setWithdrawStatus("Confirm the withdrawal in your wallet.");
    const withdrawal = buildVaultWithdrawTransaction({
      vault: config.vault,
      receiver: account,
      owner: account,
      assets: parsedAmount.assets,
      chainId: config.chainId,
    });

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
  }, [account, config, positionState, publicClient, refreshPosition, sender, withdrawAmount]);

  if (!session.isReady) {
    return <main><p aria-live="polite">Preparing your account…</p></main>;
  }

  return (
    <AppShell
      headerAction={wallet.address ? (
        <button className="button button--quiet" type="button" onClick={() => setAccountOpen(true)}>
          My Account
        </button>
      ) : undefined}
    >
      <DashboardScreen
        fundingOpen={fundingOpen}
        accountOpen={accountOpen}
        walletAddress={wallet.address}
        positionState={positionState}
        depositAmount={depositAmount}
        depositStatus={depositStatus}
        depositError={depositError}
        withdrawAmount={withdrawAmount}
        withdrawStatus={withdrawStatus}
        withdrawError={withdrawError}
        onAddMoney={() => setFundingOpen(true)}
        onCloseFunding={() => setFundingOpen(false)}
        onCloseAccount={() => setAccountOpen(false)}
        onSignOut={session.logout}
        onDepositAmountChange={setDepositAmount}
        onSubmitDeposit={() => void submitDeposit()}
        onWithdrawAmountChange={setWithdrawAmount}
        onSubmitWithdrawal={() => void submitWithdrawal()}
        onRefreshPosition={() => void refreshPosition()}
      />
    </AppShell>
  );
}