import type { CommitmentDto, GoalDto } from "@/api/kept-api";
import { ArrowRight, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CommitmentCard } from "@/features/commitments/CommitmentCard";
import { formatUsdc } from "@/features/savings/format";

function targetAmount(goal: GoalDto): string {
  try {
    return formatUsdc(BigInt(goal.targetAmountAtomic));
  } catch {
    return "—";
  }
}

interface GoalCardProps {
  readonly goal: GoalDto;
  readonly commitment?: CommitmentDto | undefined;
  readonly onAddCommitment: (goal: GoalDto) => void;
  readonly onOpen: (goal: GoalDto) => void;
}

export function GoalCard({ goal, commitment, onAddCommitment, onOpen }: GoalCardProps) {
  return (
    <Card className="overflow-hidden shadow-none transition-shadow hover:shadow-sm">
      <CardHeader className="gap-4 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Goal</p>
            <h3 className="truncate text-xl font-semibold tracking-tight">{goal.name}</h3>
          </div>
          <Badge variant="outline">{goal.status === "ACTIVE" ? "Active" : goal.status}</Badge>
        </div>

        <div>
          <p className="text-2xl font-semibold tabular-nums">{targetAmount(goal)} USDC</p>
          <p className="text-sm text-muted-foreground">target</p>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 border-t bg-muted/10 pt-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Current commitment</p>
          {!commitment && (
            <Button variant="ghost" size="sm" onClick={() => onAddCommitment(goal)}>
              <Plus className="size-4" />
              Add
            </Button>
          )}
        </div>

        {commitment ? (
          <CommitmentCard commitment={commitment} compact />
        ) : (
          <button
            type="button"
            className="w-full rounded-lg border border-dashed p-4 text-left text-sm text-muted-foreground transition hover:border-primary/40 hover:bg-accent/40 hover:text-foreground"
            onClick={() => onAddCommitment(goal)}
          >
            Add a weekly savings commitment.
          </button>
        )}

        <Button variant="ghost" className="w-full justify-between" onClick={() => onOpen(goal)}>
          Goal details
          <ArrowRight className="size-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
