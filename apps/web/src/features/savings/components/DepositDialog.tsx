import type { FormEvent } from "react";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  minimumUsdcDepositError,
  parseUsdcDepositAmount,
} from "@/lib/usdc-input";
import { formatBasisPoints } from "@/wallet/vault/fees";
import type { DepositQuoteState } from "../deposit-quote";
import { formatUsdcPrecise } from "../format";

interface DepositDialogProps {
  readonly open: boolean;
  readonly amount: string;
  readonly status: string | null;
  readonly error: string | null;
  readonly quoteState: DepositQuoteState;
  readonly availableBalance: bigint | null;
  readonly ready: boolean;
  readonly submitting: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onAmountChange: (value: string) => void;
  readonly onSubmit: () => void;
}

export function DepositDialog({
  open,
  amount,
  status,
  error,
  quoteState,
  availableBalance,
  ready,
  submitting,
  onOpenChange,
  onAmountChange,
  onSubmit,
}: DepositDialogProps) {
  const parsedAmount = parseUsdcDepositAmount(amount);

  const meetsMinimum =
    !("error" in parsedAmount) &&
    minimumUsdcDepositError(parsedAmount.assets) === null;

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && submitting) {
      return;
    }

    onOpenChange(nextOpen);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        aria-busy={submitting}
        className="sm:max-w-lg"
      >
        <form onSubmit={submit} className="space-y-6">
          <DialogHeader>
            <DialogTitle>Move to savings</DialogTitle>

            <DialogDescription>
              Choose how much of your available cash to move into savings.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-border bg-surface px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-caption text-muted-foreground">
                Available cash
              </span>

              <span className="text-label font-medium tabular-nums">
                {availableBalance === null
                  ? "…"
                  : `${formatUsdcPrecise(availableBalance)} USDC`}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="deposit-amount">Amount</Label>

              <span className="text-caption text-muted-foreground">
                Minimum 10 USDC
              </span>
            </div>

            <div className="relative">
              <Input
                id="deposit-amount"
                value={amount}
                onChange={(event) => onAmountChange(event.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="h-12 pr-28 text-body font-medium tabular-nums"
                disabled={submitting}
                autoFocus
              />

              <div className="absolute inset-y-0 right-2 flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  disabled={
                    submitting ||
                    availableBalance === null ||
                    availableBalance <= 0n
                  }
                  onClick={() => {
                    if (availableBalance === null) {
                      return;
                    }

                    onAmountChange(formatUsdcPrecise(availableBalance));
                  }}
                >
                  Max
                </Button>

                <span className="pointer-events-none pr-1 text-label font-medium text-muted-foreground">
                  USDC
                </span>
              </div>
            </div>
          </div>

          {quoteState.kind === "loading" && (
            <div
              className="space-y-3 rounded-lg border border-border bg-surface p-4 text-sm"
              aria-live="polite"
              aria-label="Updating deposit details"
            >
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Deposit fee</span>

                <LoaderCircle
                  className="size-4 animate-spin text-muted-foreground"
                  aria-hidden="true"
                />
              </div>

              <div className="flex items-center justify-between gap-4 border-t pt-3">
                <span className="font-medium">You&apos;ll add</span>

                <LoaderCircle
                  className="size-4 animate-spin text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
            </div>
          )}

          {quoteState.kind === "error" && (
            <p className="text-sm text-destructive" role="alert">
              {quoteState.message}
            </p>
          )}

          {quoteState.kind === "ready" && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-caption text-muted-foreground">
                  Deposit fee
                </span>

                <div className="text-right">
                  <p className="text-label font-medium tabular-nums">
                    {formatUsdcPrecise(quoteState.quote.depositFeeAssets)} USDC
                  </p>

                  <p className="text-caption text-muted-foreground">
                    {formatBasisPoints(
                      quoteState.quote.depositFeeBps,
                      quoteState.quote.bpsDenominator,
                    )}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-end justify-between gap-4 border-t pt-4">
                <span className="text-label font-medium">You&apos;ll add</span>

                <p className="text-h3 font-semibold tabular-nums">
                  {formatUsdcPrecise(quoteState.quote.expectedNetAssets)}{" "}
                  <span className="text-label font-medium text-muted-foreground">
                    USDC
                  </span>
                </p>
              </div>

              {quoteState.quote.performanceFeeBps > 0n && (
                <div className="mt-4 border-t pt-4">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-caption text-muted-foreground">
                      Performance fee
                    </span>

                    <span className="text-label font-medium tabular-nums">
                      {formatBasisPoints(
                        quoteState.quote.performanceFeeBps,
                        quoteState.quote.bpsDenominator,
                      )}
                    </span>
                  </div>

                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    This only applies to new gains above your previous
                    high-water mark. It is not charged on the money you deposit.
                  </p>
                </div>
              )}
            </div>
          )}

          {status && (
            <div
              className="rounded-lg bg-muted/40 px-4 py-3 text-caption text-muted-foreground"
              aria-live="polite"
            >
              {status}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              disabled={
                !ready ||
                !meetsMinimum ||
                quoteState.kind !== "ready" ||
                submitting
              }
            >
              {submitting ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Depositing…
                </>
              ) : (
                "Move to savings"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
