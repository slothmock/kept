import { useEffect, useMemo, useState } from "react";

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

type SavingsAction = "add" | "remove" | "move";

interface ManageGoalSavingsDialogProps {
  readonly goal: GoalDto | null;
  readonly goals: readonly GoalDto[];

  readonly allocatedAssets: bigint | null;
  readonly unallocatedAssets: bigint | null;

  readonly submitting: boolean;
  readonly status: string | null;
  readonly error: string | null;

  readonly onOpenChange: (open: boolean) => void;

  readonly onAdd: (
    goal: GoalDto,
    amount: string,
  ) => Promise<boolean>;

  readonly onRemove: (
    goal: GoalDto,
    amount: string,
  ) => Promise<boolean>;

  readonly onMove: (
    fromGoal: GoalDto,
    toGoal: GoalDto,
    amount: string,
  ) => Promise<boolean>;
}

export function ManageGoalSavingsDialog({
  goal,
  goals,
  allocatedAssets,
  unallocatedAssets,
  submitting,
  status,
  error,
  onOpenChange,
  onAdd,
  onRemove,
  onMove,
}: ManageGoalSavingsDialogProps) {
  const [action, setAction] =
    useState<SavingsAction>("add");

  const [amount, setAmount] = useState("");

  const [destinationGoalId, setDestinationGoalId] =
    useState("");

  const destinationGoals = useMemo(
    () =>
      goal
        ? goals.filter(
            (candidate) =>
              candidate.id !== goal.id
              && candidate.status === "ACTIVE",
          )
        : [],
    [goal, goals],
  );

  const destinationGoal = destinationGoals.find(
    (candidate) => candidate.id === destinationGoalId,
  ) ?? null;

  useEffect(() => {
    if (!goal) {
      setAction("add");
      setAmount("");
      setDestinationGoalId("");
      return;
    }

    setAction("add");
    setAmount("");
    setDestinationGoalId("");
  }, [goal]);

  const availableLabel =
    action === "add"
      ? unallocatedAssets === null
        ? "—"
        : `${formatUsdc(unallocatedAssets)} USDC`
      : allocatedAssets === null
        ? "—"
        : `${formatUsdc(allocatedAssets)} USDC`;

  const availableDescription =
    action === "add"
      ? "Available to assign"
      : "Currently assigned to this goal";

  const submitLabel =
    action === "add"
      ? "Add savings"
      : action === "remove"
        ? "Remove savings"
        : "Move savings";

  const canSubmit =
    Boolean(goal)
    && amount.trim().length > 0
    && !submitting
    && (
      action !== "move"
      || destinationGoal !== null
    );

  async function submit() {
    if (!goal || !canSubmit) return;

    let succeeded = false;

    if (action === "add") {
      succeeded = await onAdd(goal, amount);
    } else if (action === "remove") {
      succeeded = await onRemove(goal, amount);
    } else {
      if (!destinationGoal) return;

      succeeded = await onMove(
        goal,
        destinationGoal,
        amount,
      );
    }

    if (succeeded) {
      setAmount("");
      setDestinationGoalId("");
      onOpenChange(false);
    }
  }

  return (
    <Dialog
      open={goal !== null}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Manage {goal?.name ?? "goal"} savings
          </DialogTitle>

          <DialogDescription>
            Add, remove, or move savings without
            withdrawing them from Kept.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2">
            <Button
              type="button"
              variant={
                action === "add"
                  ? "default"
                  : "outline"
              }
              disabled={submitting}
              onClick={() => {
                setAction("add");
                setAmount("");
                setDestinationGoalId("");
              }}
            >
              Add
            </Button>

            <Button
              type="button"
              variant={
                action === "remove"
                  ? "default"
                  : "outline"
              }
              disabled={submitting}
              onClick={() => {
                setAction("remove");
                setAmount("");
                setDestinationGoalId("");
              }}
            >
              Remove
            </Button>

            <Button
              type="button"
              variant={
                action === "move"
                  ? "default"
                  : "outline"
              }
              disabled={
                submitting
                || destinationGoals.length === 0
              }
              onClick={() => {
                setAction("move");
                setAmount("");
                setDestinationGoalId("");
              }}
            >
              Move
            </Button>
          </div>

          <div className="rounded-lg border bg-muted/40 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {availableDescription}
            </p>

            <p className="mt-1 text-lg font-semibold">
              {availableLabel}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal-savings-amount">
              Amount
            </Label>

            <div className="relative">
              <Input
                id="goal-savings-amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={amount}
                disabled={submitting}
                onChange={(event) =>
                  setAmount(event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void submit();
                  }
                }}
              />

              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                USDC
              </span>
            </div>
          </div>

          {action === "move" && (
            <div className="space-y-2">
              <Label htmlFor="goal-savings-destination">
                Move to
              </Label>

              <select
                id="goal-savings-destination"
                value={destinationGoalId}
                disabled={submitting}
                onChange={(event) =>
                  setDestinationGoalId(
                    event.target.value,
                  )
                }
                className="
                  flex h-10 w-full rounded-md border
                  border-input bg-background px-3 py-2
                  text-sm ring-offset-background
                  focus-visible:outline-none
                  focus-visible:ring-2
                  focus-visible:ring-ring
                  focus-visible:ring-offset-2
                  disabled:cursor-not-allowed
                  disabled:opacity-50
                "
              >
                <option value="">
                  Choose a goal
                </option>

                {destinationGoals.map(
                  (destination) => (
                    <option
                      key={destination.id}
                      value={destination.id}
                    >
                      {destination.name}
                    </option>
                  ),
                )}
              </select>

              {destinationGoals.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  You need another active goal before
                  you can move savings.
                </p>
              )}
            </div>
          )}

          {action === "remove" && (
            <p className="text-sm text-muted-foreground">
              Removed savings stay in Kept and become
              available to assign to another goal.
            </p>
          )}

          {action === "move" && (
            <p className="text-sm text-muted-foreground">
              This changes which goal the savings are
              assigned to. Your total Kept balance does
              not change.
            </p>
          )}

          {status && (
            <p
              className="text-sm text-muted-foreground"
              aria-live="polite"
            >
              {status}
            </p>
          )}

          {error && (
            <p
              className="
                rounded-lg border border-destructive/20
                bg-destructive/5 px-3 py-2
                text-sm text-destructive
              "
              role="alert"
            >
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>

          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            {submitting
              ? "Saving…"
              : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}