import type { CommitmentDto, GoalDto } from "@/api/kept-api";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { CommitmentCard } from "@/features/commitments/CommitmentCard";
import { formatUsdc } from "@/features/savings/format";

function amount(goal: GoalDto): string {
  try {
    return formatUsdc(BigInt(goal.targetAmountAtomic));
  } catch {
    return "—";
  }
}

interface GoalDetailsDialogProps {
  readonly open: boolean;
  readonly goal: GoalDto | null;
  readonly commitments: readonly CommitmentDto[];
  readonly onOpenChange: (open: boolean) => void;
  readonly onAddCommitment: (goal: GoalDto) => void;
}

export function GoalDetailsDialog({ open, goal, commitments, onOpenChange, onAddCommitment }: GoalDetailsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        {goal && (
          <>
            <DialogHeader>
              <DialogTitle>{goal.name}</DialogTitle>
              <DialogDescription>
                {amount(goal)} {goal.targetAsset} target{goal.targetDate ? ` by ${goal.targetDate}` : ""}.
              </DialogDescription>
            </DialogHeader>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-medium">Commitments</h3>
                  <p className="text-sm text-muted-foreground">Weekly actions connected to this goal.</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => onAddCommitment(goal)}>Add commitment</Button>
              </div>

              {commitments.length ? (
                <div className="space-y-3">
                  {commitments.map((commitment) => <CommitmentCard key={commitment.id} commitment={commitment} />)}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                  No commitments yet.
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Goal targets organise your progress; they do not lock or earmark your vault balance.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
