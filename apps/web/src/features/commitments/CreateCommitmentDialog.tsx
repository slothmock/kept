import { useEffect, useMemo, useState } from "react";
import { Activity, PiggyBank } from "lucide-react";

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
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

import {
  REWARD_POLICY,
  rewardRateLabel,
} from "./reward-policy";

export interface CreateCommitmentInput {
  readonly code: "WEEKLY_SAVINGS_V1" | "ACTIVITY_COUNT_V1";
  readonly target: string;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly verificationDeadline: Date;
}

interface CreateCommitmentDialogProps {
  readonly open: boolean;
  readonly goal: GoalDto | null;
  readonly submitting: boolean;
  readonly error: string | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (goal: GoalDto, input: CreateCommitmentInput) => Promise<boolean>;
}

export function CreateCommitmentDialog({ open, goal, submitting, error, onOpenChange, onSubmit }: CreateCommitmentDialogProps) {
  const [code, setCode] = useState<CreateCommitmentInput["code"]>("WEEKLY_SAVINGS_V1");
  const [target, setTarget] = useState("");

  useEffect(() => {
    if (!open) {
      setCode("WEEKLY_SAVINGS_V1");
      setTarget("");
    }
  }, [open]);

  const dates = useMemo(() => {
    const startAt = new Date();
    const endAt = new Date(startAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    const verificationDeadline = new Date(endAt.getTime() + 24 * 60 * 60 * 1000);
    return { startAt, endAt, verificationDeadline };
  }, [open]);

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!goal) return;
    const created = await onSubmit(goal, { code, target, ...dates });
    if (created) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={(event) => void submit(event)} className="space-y-6">
          <DialogHeader>
            <DialogTitle>Add a weekly commitment</DialogTitle>
            <DialogDescription>
              {goal ? `Choose one measurable action for “${goal.name}”.` : "Choose one measurable action."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setCode("WEEKLY_SAVINGS_V1")}
              className={cn(
                "rounded-xl border p-4 text-left transition",
                code === "WEEKLY_SAVINGS_V1" ? "border-primary bg-accent/60 ring-1 ring-primary/20" : "hover:bg-muted/50",
              )}
            >
              <PiggyBank className="mb-3 size-5 text-primary" />
              <p className="font-medium">Save weekly</p>
              <p className="mt-1 text-xs text-muted-foreground">Commit to adding an amount this week.</p>
            </button>

            <button
              type="button"
              onClick={() => setCode("ACTIVITY_COUNT_V1")}
              className={cn(
                "rounded-xl border p-4 text-left transition",
                code === "ACTIVITY_COUNT_V1" ? "border-primary bg-accent/60 ring-1 ring-primary/20" : "hover:bg-muted/50",
              )}
            >
              <Activity className="mb-3 size-5 text-primary" />
              <p className="font-medium">Stay active</p>
              <p className="mt-1 text-xs text-muted-foreground">Commit to a number of activities this week.</p>
            </button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="commitment-target">
              {code === "WEEKLY_SAVINGS_V1" ? "Amount to save" : "Number of activities"}
            </Label>
            <Input
              id="commitment-target"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              inputMode={code === "WEEKLY_SAVINGS_V1" ? "decimal" : "numeric"}
              placeholder={code === "WEEKLY_SAVINGS_V1" ? "50.00" : "3"}
            />
            <p className="text-xs text-muted-foreground">
              Commitments never lock your savings.
            </p>
          </div>

              {code && (
                <Card className="bg-muted/40">
                  <CardContent className="space-y-3 pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          Weekly commitment bonus
                        </p>
    
                        <p className="text-xs text-muted-foreground">
                          Earned when this commitment is verified.
                        </p>
                      </div>
    
                      <Badge variant="secondary">
                        {rewardRateLabel(code)}
                      </Badge>
                    </div>
    
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Maximum weekly bonus
                      </span>
    
                      <span className="font-medium">
                        {code === "WEEKLY_SAVINGS_V1"
                          ? "2.00 USDC"
                          : "1.00 USDC"}
                      </span>
                    </div>
    
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Your bonus is calculated from the average balance
                      kept in this goal during the commitment period.
                      Your funds remain withdrawable at any time.
                    </p>
                  </CardContent>
                </Card>
              )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !goal}>
              {submitting ? "Creating…" : "Add commitment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
