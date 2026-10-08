import { useState } from "react";
import { Activity, PiggyBank } from "lucide-react";

import type { CommitmentDto, GoalDto } from "@/api/kept-api";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";

import { COMMITMENT_OPTIONS } from "../options";
import { commitmentSchedule } from "../commitment-schedule";
import { formatUsdcPrecise } from "@/features/savings/format";

export interface CreateCommitmentInput {
  readonly code: "WEEKLY_SAVINGS_V1";

  readonly target: string;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly verificationDeadline: Date;
}

interface CreateCommitmentDialogProps {
  readonly open: boolean;
  readonly goal: GoalDto | null;
  readonly draft: CommitmentDto | null;
  readonly currentCommitments: readonly CommitmentDto[];
  readonly submitting: boolean;
  readonly status: string | null;
  readonly error: string | null;

  readonly onOpenChange: (open: boolean) => void;

  readonly onSubmit: (
    goal: GoalDto,
    input: CreateCommitmentInput,
  ) => Promise<boolean>;
}

type CommitmentCode = "WEEKLY_SAVINGS_V1";

export function CreateCommitmentDialog({
  open,
  goal,
  draft,
  currentCommitments,
  submitting,
  status,
  error,
  onOpenChange,
  onSubmit,
}: CreateCommitmentDialogProps) {
  const [code, setCode] =
    useState<CommitmentCode | null>(null);

  const [target, setTarget] = useState("");

  const weeklySavingsAlreadyAdded =
    currentCommitments.some(
      (commitment) =>
        commitment.definition.code === "WEEKLY_SAVINGS_V1"
        && (
          commitment.state === "DRAFT"
          || commitment.state === "ACTIVE"
        ),
    );

  function resetForm() {
    setCode(null);
    setTarget("");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && submitting) return;
    if (!nextOpen) {
      resetForm();
    }

    onOpenChange(nextOpen);
  }

  function selectCode(
    nextCode: CommitmentCode,
  ) {
    setCode(nextCode);
    const draftAmount = draft?.definition.code === nextCode
      ? draft.parameters.targetAmountAtomic
      : null;
    setTarget(
      typeof draftAmount === "string" && /^\d+$/.test(draftAmount)
        ? formatUsdcPrecise(BigInt(draftAmount))
        : "",
    );
  }

  async function submit(
    event: React.SubmitEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!goal || !code) {
      return;
    }

    const { startAt, endAt, verificationDeadline } = commitmentSchedule();

    const created = await onSubmit(goal, {
      code,
      target,
      startAt,
      endAt,
      verificationDeadline,
    });

    if (created) {
      resetForm();
      onOpenChange(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
    >
      <DialogContent aria-busy={submitting}>
        <form
          onSubmit={(event) =>
            void submit(event)
          }
          className="space-y-6"
        >
          <DialogHeader>
            <DialogTitle>
              Add a weekly commitment
            </DialogTitle>

            <DialogDescription>
              {goal
                ? `Choose one measurable action for “${goal.name}”.`
                : "Choose one measurable action."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Label>
              How do you want to make progress?
            </Label>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={weeklySavingsAlreadyAdded}
                aria-disabled={weeklySavingsAlreadyAdded}
                aria-pressed={
                  code ===
                  "WEEKLY_SAVINGS_V1"
                }
                onClick={() =>
                  selectCode(
                    "WEEKLY_SAVINGS_V1",
                  )
                }
                className={cn(
                  "rounded-xl border p-4 text-left transition",
                  weeklySavingsAlreadyAdded
                    ? "cursor-not-allowed opacity-60"
                    : code ===
                        "WEEKLY_SAVINGS_V1"
                      ? "border-primary bg-accent/60 ring-1 ring-primary/20"
                      : "hover:bg-muted/50",
                )}
              >
                <PiggyBank className="mb-3 size-5 text-primary" />

                <p className="font-medium">
                  {COMMITMENT_OPTIONS.WEEKLY_SAVINGS_V1.title}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  {COMMITMENT_OPTIONS.WEEKLY_SAVINGS_V1.description}
                </p>

                {weeklySavingsAlreadyAdded ? (
                  <Badge
                    variant="secondary"
                    className="mt-3"
                  >
                    Already added
                  </Badge>
                ) : null}
              </button>

              <button
                type="button"
                disabled
                aria-disabled="true"
                className="cursor-not-allowed rounded-xl border p-4 text-left opacity-60"
              >
                <Activity className="mb-3 size-5 text-primary" />

                <p className="font-medium">
                  {COMMITMENT_OPTIONS.ACTIVITY_COUNT_V1.title}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  {COMMITMENT_OPTIONS.ACTIVITY_COUNT_V1.description}
                </p>

                <Badge
                  variant="secondary"
                  className="mt-3"
                >
                  {COMMITMENT_OPTIONS.ACTIVITY_COUNT_V1.availabilityLabel}
                </Badge>
              </button>
            </div>
          </div>

          {code && (
            <>
              <div className="space-y-2">
                <Label htmlFor="commitment-target">
                  Amount to save each week
                </Label>

                <Input
                  id="commitment-target"
                  value={target}
                  onChange={(event) =>
                    setTarget(
                      event.target.value,
                    )
                  }
                  inputMode="decimal"
                  placeholder="50.00"
                />

                <p className="text-xs text-muted-foreground">
                  This is the amount you plan to add to the goal this week.
                </p>
              </div>
            </>
          )}

          {error && (
            <p className="text-sm text-destructive">
              {error}
            </p>
          )}

          {status && (
            <p className="text-sm text-muted-foreground" role="status">
              {status}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                handleOpenChange(false)
              }
              disabled={submitting}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              disabled={
                submitting ||
                !goal ||
                !code ||
                !target.trim()
              }
            >
              {submitting
                ? "Creating…"
                : "Add commitment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}