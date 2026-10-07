import {
  ArrowLeft,
  ArrowRight,
  Landmark,
  WalletCards,
} from "lucide-react";
import {
  useState,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { FundingAsset } from "@/features/funding/intents/supported-tokens";
import { formatUsdc } from "@/features/savings/format";
import { CryptoWithdrawalStep } from "@/features/withdrawals/components/CryptoWithdrawalStep";

type WithdrawalView =
  | "choose"
  | "available-cash"
  | "crypto"
  | "bank";

interface WithdrawablePosition {
  readonly withdrawableAssets: bigint;
  readonly usdcBalance: bigint;
}

interface WithdrawViewProps {
  readonly position: WithdrawablePosition | null;
  readonly amount: string;
  readonly status: string | null;
  readonly error: string | null;
  readonly submitting: boolean;
  readonly cryptoAvailable?: boolean;
  readonly bankAvailable?: boolean;
  readonly bankEnabled?: boolean;
  readonly onBack: () => void;
  readonly onAmountChange: (value: string) => void;
  readonly onSubmitAvailableCash: () => void;
  readonly cryptoAmount: string;
  readonly cryptoRecipient: string;
  readonly cryptoDestinationAssets: readonly FundingAsset[];
  readonly cryptoDestinationAssetId: string | null;
  readonly cryptoPreviewing: boolean;
  readonly cryptoPreviewReady: boolean;
  readonly cryptoPreviewStatus: string | null;
  readonly cryptoPreviewError: string | null;
  readonly cryptoExecuting: boolean;
  readonly cryptoExecutionStatus: string | null;
  readonly cryptoExecutionError: string | null;
  readonly cryptoEstimatedReceive?: string | null;
  readonly onCryptoAmountChange: (value: string) => void;
  readonly onCryptoRecipientChange: (value: string) => void;
  readonly onCryptoDestinationAssetChange: (assetId: string) => void;
  readonly onPreviewCryptoWithdrawal: () => void;
  readonly onExecuteCryptoWithdrawal: () => void;
  readonly bankAmount: string;
  readonly bankSubmitting: boolean;
  readonly bankStatus: string | null;
  readonly bankError: string | null;
  readonly bankPhase:
    | "setup"
    | "moonpay"
    | "waiting"
    | "review"
    | "sending"
    | "processing"
    | "complete"
    | "failed";
  readonly bankReviewAmount: string | null;
  readonly bankMinimumReceive: string | null;
  readonly onBankAmountChange: (value: string) => void;
  readonly onStartBankWithdrawal: () => void;
  readonly onRefreshBankWithdrawal: () => void;
  readonly onConfirmBankWithdrawal: () => void;
}

export function WithdrawView({
  position,
  amount,
  status,
  error,
  submitting,
  cryptoAvailable = false,
  bankAvailable = false,
  bankEnabled = false,
  onBack,
  onAmountChange,
  onSubmitAvailableCash,
  cryptoAmount,
  cryptoRecipient,
  cryptoDestinationAssets,
  cryptoDestinationAssetId,
  cryptoPreviewing,
  cryptoPreviewReady,
  cryptoPreviewStatus,
  cryptoPreviewError,
  cryptoExecuting,
  cryptoExecutionStatus,
  cryptoExecutionError,
  cryptoEstimatedReceive = null,
  onCryptoAmountChange,
  onCryptoRecipientChange,
  onCryptoDestinationAssetChange,
  onPreviewCryptoWithdrawal,
  onExecuteCryptoWithdrawal,
  bankAmount,
  bankSubmitting,
  bankStatus,
  bankError,
  bankPhase,
  bankReviewAmount,
  bankMinimumReceive,
  onBankAmountChange,
  onStartBankWithdrawal,
  onRefreshBankWithdrawal,
  onConfirmBankWithdrawal,
}: WithdrawViewProps) {
  const [view, setView] =
    useState<WithdrawalView>("choose");

  const activeView: WithdrawalView =
    bankPhase !== "setup"
      ? "bank"
      : view;

  const withdrawableAssets =
    position?.withdrawableAssets ?? 0n;

  const availableCash =
    position?.usdcBalance ?? 0n;

  const totalAvailableAssets =
    availableCash + withdrawableAssets;

  const backLabel =
    activeView === "choose"
      ? "Home"
      : "Withdraw";

  const handleBack = () => {
    if (activeView === "choose") {
      onBack();
      return;
    }

    if (bankPhase === "setup") {
      setView("choose");
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-3 text-muted-foreground"
          disabled={
            submitting
            || bankSubmitting
            || cryptoExecuting
          }
          onClick={handleBack}
        >
          <ArrowLeft className="size-4" />
          {backLabel}
        </Button>

        <div className="mt-4">
          <p className="text-caption font-medium text-primary">
            Withdraw
          </p>

          <h1 className="mt-2 text-h1 font-semibold tracking-tight">
            Withdraw from Kept.
          </h1>

          <p className="mt-2 max-w-2xl text-body text-muted-foreground">
            Move money to available cash, send it to a crypto wallet, or cash out through a supported payment route.
          </p>
        </div>
      </div>

      <Card className="mx-auto w-full max-w-2xl shadow-none">
        <CardContent className="p-5 sm:p-6">
          {activeView === "choose" ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-h2 font-semibold tracking-tight">
                  Choose destination
                </h2>

                <p className="mt-2 text-caption text-muted-foreground">
                  Available balance includes cash already in Kept and savings currently available to withdraw.
                </p>
              </div>

              <div className="rounded-lg border border-border bg-surface px-4 py-3">
                <p className="text-caption text-muted-foreground">
                  Available to withdraw
                </p>

                <p className="mt-1 text-h3 font-semibold tabular-nums">
                  {formatUsdc(totalAvailableAssets)} USDC
                </p>
              </div>

              <div className="space-y-3">
                <WithdrawalMethod
                  icon={<WalletCards className="size-4" />}
                  title="Available cash"
                  description="Move money out of savings while keeping it inside your Kept account."
                  onClick={() => setView("available-cash")}
                />

                {cryptoAvailable ? (
                  <WithdrawalMethod
                    icon={<WalletCards className="size-4" />}
                    title="Crypto wallet"
                    description="Send USDC to a supported asset and network outside Kept."
                    onClick={() => setView("crypto")}
                  />
                ) : null}

                {bankAvailable ? (
                  <WithdrawalMethod
                    icon={<Landmark className="size-4" />}
                    title={
                      bankEnabled
                        ? "Bank account"
                        : "Bank account — Coming soon"
                    }
                    description="Cash out through Kept's payment partner."
                    disabled={!bankEnabled}
                    onClick={() => setView("bank")}
                  />
                ) : null}
              </div>
            </div>
          ) : activeView === "available-cash" ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-h2 font-semibold tracking-tight">
                  Move to available cash
                </h2>

                <p className="mt-2 text-caption text-muted-foreground">
                  Withdraw money from savings while keeping it ready to use inside Kept.
                </p>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="withdraw-available-cash-amount"
                  className="text-label font-medium"
                >
                  Amount
                </label>

                <div className="relative">
                  <Input
                    id="withdraw-available-cash-amount"
                    inputMode="decimal"
                    autoComplete="off"
                    value={amount}
                    disabled={submitting}
                    placeholder="0.00"
                    className="h-12 pr-16 text-body font-medium tabular-nums"
                    onChange={(event) =>
                      onAmountChange(event.target.value)
                    }
                  />

                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-caption text-muted-foreground">
                    USDC
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 text-caption text-muted-foreground">
                  <span>Available from savings</span>

                  <button
                    type="button"
                    disabled={
                      submitting
                      || withdrawableAssets === 0n
                    }
                    className="font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50"
                    onClick={() =>
                      onAmountChange(
                        formatUsdc(withdrawableAssets),
                      )
                    }
                  >
                    {formatUsdc(withdrawableAssets)} USDC
                  </button>
                </div>
              </div>

              {error ? (
                <p
                  role="alert"
                  className="rounded-lg border border-destructive/25 bg-danger-surface px-4 py-3 text-caption text-destructive"
                >
                  {error}
                </p>
              ) : null}

              {status ? (
                <p
                  role="status"
                  className="rounded-lg border border-border bg-surface px-4 py-3 text-caption"
                >
                  {status}
                </p>
              ) : null}

              <Button
                type="button"
                className="w-full"
                disabled={
                  submitting
                  || withdrawableAssets === 0n
                  || amount.trim().length === 0
                }
                onClick={onSubmitAvailableCash}
              >
                {submitting
                  ? "Withdrawing…"
                  : "Move to available cash"}
              </Button>
            </div>
          ) : activeView === "crypto" ? (
            <CryptoWithdrawalStep
              availableAssets={totalAvailableAssets}
              amount={cryptoAmount}
              recipient={cryptoRecipient}
              destinationAssets={cryptoDestinationAssets}
              destinationAssetId={cryptoDestinationAssetId}
              previewing={cryptoPreviewing}
              previewReady={cryptoPreviewReady}
              previewStatus={cryptoPreviewStatus}
              previewError={cryptoPreviewError}
              executing={cryptoExecuting}
              executionStatus={cryptoExecutionStatus}
              executionError={cryptoExecutionError}
              estimatedReceive={cryptoEstimatedReceive}
              onBack={() => setView("choose")}
              onAmountChange={onCryptoAmountChange}
              onRecipientChange={onCryptoRecipientChange}
              onDestinationAssetChange={onCryptoDestinationAssetChange}
              onPreview={onPreviewCryptoWithdrawal}
              onExecute={onExecuteCryptoWithdrawal}
            />
          ) : (
            <div className="space-y-6">
              <div>
                <h2 className="text-h2 font-semibold tracking-tight">
                  Withdraw to bank
                </h2>

                <p className="mt-2 text-caption text-muted-foreground">
                  {bankPhase === "setup"
                    ? "Choose how much to withdraw. Bank details and identity checks are handled by our payment partner."
                    : bankPhase === "review"
                      ? "Review the verified withdrawal details before money leaves Kept."
                      : "Kept will keep this withdrawal secure while the payout is prepared."}
                </p>
              </div>

              {bankPhase === "setup" ? (
                <div className="space-y-2">
                  <label
                    htmlFor="withdraw-bank-amount"
                    className="text-label font-medium"
                  >
                    Amount
                  </label>

                  <div className="relative">
                    <Input
                      id="withdraw-bank-amount"
                      inputMode="decimal"
                      autoComplete="off"
                      value={bankAmount}
                      disabled={bankSubmitting}
                      placeholder="0.00"
                      className="h-12 pr-16 text-body font-medium tabular-nums"
                      onChange={(event) =>
                        onBankAmountChange(event.target.value)
                      }
                    />

                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-caption text-muted-foreground">
                      USDC
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3 text-caption text-muted-foreground">
                    <span>Available to withdraw</span>

                    <button
                      type="button"
                      disabled={
                        bankSubmitting
                        || totalAvailableAssets === 0n
                      }
                      className="font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50"
                      onClick={() =>
                        onBankAmountChange(
                          formatUsdc(totalAvailableAssets),
                        )
                      }
                    >
                      {formatUsdc(totalAvailableAssets)} USDC
                    </button>
                  </div>
                </div>
              ) : bankPhase === "review" ? (
                <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
                  <DetailRow
                    label="Withdrawal amount"
                    value={`${bankReviewAmount ?? "—"} USDC`}
                  />

                  {bankMinimumReceive ? (
                    <DetailRow
                      label="Kept transfer minimum"
                      value={`${bankMinimumReceive} USDC`}
                    />
                  ) : null}

                  <p className="border-t pt-3 text-caption text-muted-foreground">
                    Final payout and payment-partner fees were shown during payout setup. Kept only sends funds using verified withdrawal details.
                  </p>
                </div>
              ) : null}

              {bankError ? (
                <p
                  role="alert"
                  className="rounded-lg border border-destructive/25 bg-danger-surface px-4 py-3 text-caption text-destructive"
                >
                  {bankError}
                </p>
              ) : null}

              {bankStatus ? (
                <p
                  role="status"
                  className="rounded-lg border border-border bg-surface px-4 py-3 text-caption"
                >
                  {bankStatus}
                </p>
              ) : null}

              {bankPhase === "setup" ? (
                <Button
                  type="button"
                  className="w-full"
                  disabled={
                    bankSubmitting
                    || bankAmount.trim().length === 0
                    || totalAvailableAssets === 0n
                  }
                  onClick={onStartBankWithdrawal}
                >
                  {bankSubmitting
                    ? "Preparing…"
                    : "Continue"}
                </Button>
              ) : null}

              {bankPhase === "waiting" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={bankSubmitting}
                  onClick={onRefreshBankWithdrawal}
                >
                  Check again
                </Button>
              ) : null}

              {bankPhase === "review" ? (
                <Button
                  type="button"
                  className="w-full"
                  disabled={bankSubmitting}
                  onClick={onConfirmBankWithdrawal}
                >
                  Confirm bank withdrawal
                </Button>
              ) : null}

              {bankPhase === "failed" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setView("choose")}
                >
                  Choose another withdrawal method
                </Button>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-caption text-muted-foreground">
        {label}
      </span>

      <span className="text-label font-medium tabular-nums">
        {value}
      </span>
    </div>
  );
}

function WithdrawalMethod({
  icon,
  title,
  description,
  disabled = false,
  onClick,
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly description: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group flex w-full items-center gap-4 rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-surface"
    >
      <div className="grid size-9 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-label font-medium">
          {title}
        </p>

        <p className="mt-1 text-caption text-muted-foreground">
          {description}
        </p>
      </div>

      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
