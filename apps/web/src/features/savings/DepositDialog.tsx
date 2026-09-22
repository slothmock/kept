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

interface DepositDialogProps {
  readonly open: boolean;
  readonly amount: string;
  readonly status: string | null;
  readonly error: string | null;
  readonly ready: boolean;
  readonly submitting: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onAmountChange: (value: string) => void;
  readonly onSubmit: () => void;
}

export function DepositDialog({ open, amount, status, error, ready, submitting, onOpenChange, onAmountChange, onSubmit }: DepositDialogProps) {
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

          {status && <p className="text-sm text-muted-foreground" aria-live="polite">{status}</p>}
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={!ready || submitting || !amount.trim()}>
              {submitting ? "Adding…" : "Add money"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
