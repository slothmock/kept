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
import { formatBasisPoints } from "@/vault/fees";
import type { DepositQuoteState } from "./deposit-quote";
import { formatUsdcPrecise } from "./format";

interface DepositDialogProps {
  readonly open: boolean;
  readonly amount: string;
  readonly status: string | null;
  readonly error: string | null;
  readonly quoteState: DepositQuoteState;
  readonly ready: boolean;
  readonly submitting: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onAmountChange: (value: string) => void;
  readonly onSubmit: () => void;
}

export function DepositDialog({ open, amount, status, error, quoteState, ready, submitting, onOpenChange, onAmountChange, onSubmit }: DepositDialogProps) {
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && submitting) return;
    onOpenChange(nextOpen);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-6">
          <DialogHeader>
            <DialogTitle>Add money</DialogTitle>
            <DialogDescription>
              Add USDC to Kept. Your balance remains available to withdraw.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="deposit-amount">Amount</Label>
            <div className="relative">
              <Input
                id="deposit-amount"
                value={amount}
                onChange={(event) => onAmountChange(event.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="pr-16"
                disabled={submitting}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground">USDC</span>
            </div>
          </div>

          {quoteState.kind === "loading" && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm" aria-live="polite" aria-label="Updating fee details">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Deposit fee</span>
                <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
              </div>
              <div className="flex items-center justify-between gap-4 border-t pt-3">
                <span>Expected net amount</span>
                <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
              </div>
              <div className="flex items-center justify-between gap-4 border-t pt-3">
                <span className="text-muted-foreground">Performance fee</span>
                <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Updating the fee details for this amount.
              </p>
            </div>
          )}

          {quoteState.kind === "error" && (
            <p className="text-sm text-destructive" role="alert">{quoteState.message}</p>
          )}

          {quoteState.kind === "ready" && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">
                  Deposit fee ({formatBasisPoints(quoteState.quote.depositFeeBps, quoteState.quote.bpsDenominator)})
                </span>
                <span className="font-medium tabular-nums">{formatUsdcPrecise(quoteState.quote.depositFeeAssets)} USDC</span>
              </div>
              <div className="flex items-center justify-between gap-4 border-t pt-3">
                <span>Expected net amount</span>
                <span className="font-semibold tabular-nums">{formatUsdcPrecise(quoteState.quote.expectedNetAssets)} USDC</span>
              </div>
              <div className="flex items-center justify-between gap-4 border-t pt-3">
                <span className="text-muted-foreground">Performance fee</span>
                <span className="font-medium tabular-nums">{formatBasisPoints(quoteState.quote.performanceFeeBps, quoteState.quote.bpsDenominator)}</span>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                The deposit fee reduces the value credited to your savings. The performance fee applies only to new investment gains above the previous high-water mark. It is not charged on the money you add, and the same gain is not charged twice.
              </p>
            </div>
          )}

          {status && <p className="text-sm text-muted-foreground" aria-live="polite">{status}</p>}
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={!ready || quoteState.kind !== "ready" || submitting || !amount.trim()}>
              {submitting ? "Adding…" : "Add money"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
