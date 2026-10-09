import type { FormEvent } from "react";
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
import { formatUsdc } from "@/features/savings/format";

interface WithdrawSavingsDialogProps {
  readonly open: boolean;
  readonly amount: string;
  readonly status: string | null;
  readonly error: string | null;
  readonly availableBalance: bigint | null;
  readonly ready: boolean;
  readonly submitting: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onAmountChange: (value: string) => void;
  readonly onSubmit: () => void;
}

export function WithdrawSavingsDialog({
  open,
  amount,
  status,
  error,
  availableBalance,
  ready,
  submitting,
  onOpenChange,
  onAmountChange,
  onSubmit,
}: WithdrawSavingsDialogProps) {
  const canSubmit =
    ready && !submitting && availableBalance !== null &&
    availableBalance > 0n && amount.trim().length > 0;

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && submitting) return;
    onOpenChange(nextOpen);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSubmit) onSubmit();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent aria-busy={submitting} className="sm:max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-6">
          <DialogHeader>
            <DialogTitle>Withdraw from savings</DialogTitle>
            <DialogDescription>
              Move USDC from your savings vault to available cash in Kept.
              To send money outside Kept, use the Withdraw screen.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-border bg-surface px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-caption text-muted-foreground">Available from savings</span>
              <span className="text-label font-medium tabular-nums">
                {availableBalance === null ? "…" : `${formatUsdc(availableBalance)} USDC`}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="withdraw-savings-amount">Amount</Label>
            <div className="relative">
              <Input
                id="withdraw-savings-amount"
                value={amount}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                disabled={!ready || submitting}
                className="h-12 pr-16 text-body font-medium tabular-nums"
                onChange={(event) => onAmountChange(event.target.value)}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-caption text-muted-foreground">
                USDC
              </span>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!ready || submitting || availableBalance === null || availableBalance === 0n}
                onClick={() => {
                  if (availableBalance !== null) onAmountChange(formatUsdc(availableBalance));
                }}
              >
                Max
              </Button>
            </div>
          </div>

          {error ? <p role="alert" className="text-caption text-destructive">{error}</p> : null}
          {status ? <p role="status" className="text-caption text-muted-foreground">{status}</p> : null}

          <DialogFooter>
            <Button type="submit" disabled={!canSubmit} className="w-full sm:w-auto">
              {submitting ? "Withdrawing…" : "Move to available cash"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
