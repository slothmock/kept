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
import { formatUsdc } from "./format";
import type { VaultPosition } from "@/vault/position";

interface WithdrawDialogProps {
  readonly open: boolean;
  readonly position: VaultPosition | null;
  readonly amount: string;
  readonly status: string | null;
  readonly error: string | null;
  readonly submitting: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onAmountChange: (value: string) => void;
  readonly onSubmit: () => void;
}

export function WithdrawDialog({ open, position, amount, status, error, submitting, onOpenChange, onAmountChange, onSubmit }: WithdrawDialogProps) {
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
            <DialogTitle>Withdraw</DialogTitle>
            <DialogDescription>
              Withdraw from Kept at any time. Commitments do not lock your funds.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            Available: <span className="font-medium tabular-nums">{position ? `${formatUsdc(position.withdrawableAssets)} USDC` : "—"}</span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="withdraw-amount">Amount</Label>
            <div className="relative">
              <Input
                id="withdraw-amount"
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
            <Button type="submit" disabled={!position || position.withdrawableAssets === 0n || submitting || !amount.trim()}>
              {submitting ? "Withdrawing…" : "Withdraw"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
