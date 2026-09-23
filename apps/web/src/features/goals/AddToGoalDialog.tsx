import { useState, type FormEvent } from "react";

import type { GoalDto } from "@/api/kept-api";
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

interface AddToGoalDialogProps {
  readonly goal: GoalDto | null;
  readonly unallocatedAssets: bigint | null;
  readonly submitting: boolean;
  readonly status: string | null;
  readonly error: string | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (goal: GoalDto, amount: string) => Promise<boolean>;
}

export function AddToGoalDialog({
  goal,
  unallocatedAssets,
  submitting,
  status,
  error,
  onOpenChange,
  onSubmit,
}: AddToGoalDialogProps) {
  const [amount, setAmount] = useState("");

  function close(nextOpen: boolean) {
    if (!nextOpen && submitting) return;
    if (!nextOpen) setAmount("");
    onOpenChange(nextOpen);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!goal) return;
    if (await onSubmit(goal, amount)) {
      setAmount("");
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={goal !== null} onOpenChange={close}>
      <DialogContent dismissible={!submitting} aria-busy={submitting}>
        <form className="space-y-6" onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>Add to {goal?.name ?? "goal"}</DialogTitle>
            <DialogDescription>
              Assign some of your unallocated savings to this goal. Your money stays in your Kept account.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              Unallocated: <span className="font-medium tabular-nums text-foreground">
                {unallocatedAssets === null ? "—" : `${formatUsdc(unallocatedAssets)} USDC`}
              </span>
            </p>
            <div className="space-y-2">
              <Label htmlFor="goal-allocation-amount">Amount</Label>
              <div className="relative">
                <Input
                  id="goal-allocation-amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder="25.00"
                  className="pr-16"
                  autoFocus
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground">
                  USDC
                </span>
              </div>
            </div>
            {status && <p className="text-sm text-muted-foreground" aria-live="polite">{status}</p>}
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || unallocatedAssets === null}>
              {submitting ? "Adding…" : "Add to goal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
