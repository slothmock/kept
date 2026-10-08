import { useState } from "react";
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

interface CreateGoalDialogProps {
  readonly open: boolean;
  readonly submitting: boolean;
  readonly error: string | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (input: {
    readonly name: string;
    readonly targetAmount: string;
    readonly targetDate: string | null;
  }) => Promise<boolean>;
}

export function CreateGoalDialog({ open, submitting, error, onOpenChange, onSubmit }: CreateGoalDialogProps) {
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");

  function resetForm() {
    setName("");
    setTargetAmount("");
    setTargetDate("");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && submitting) return;
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const created = await onSubmit({
      name,
      targetAmount,
      targetDate: targetDate || null,
    });
    if (created) {
      resetForm();
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent aria-busy={submitting}>
        <form onSubmit={(event) => void submit(event)} className="space-y-6">
          <DialogHeader>
            <DialogTitle>Create a goal</DialogTitle>
            <DialogDescription>
              Start with the outcome. You can add a weekly commitment afterwards.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="goal-name">Goal name</Label>
              <Input
                id="goal-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Emergency fund"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="goal-target">Target amount</Label>
              <div className="relative">
                <Input
                  id="goal-target"
                  value={targetAmount}
                  onChange={(event) => setTargetAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder="1000.00"
                  className="pr-16"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground">
                  USDC
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="goal-date">Target date <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input
                id="goal-date"
                type="date"
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create goal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
