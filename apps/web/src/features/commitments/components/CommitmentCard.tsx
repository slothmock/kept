import type { CommitmentDto } from "@/api/kept-api";
import { Activity, PiggyBank } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { commitmentStatus, commitmentTitle } from "../display";

interface CommitmentCardProps {
  readonly commitment: CommitmentDto;
  readonly compact?: boolean;
}

export function CommitmentCard({ commitment, compact = false }: CommitmentCardProps) {
  const savings = commitment.definition.code === "WEEKLY_SAVINGS_V1";
  const Icon = savings ? PiggyBank : Activity;

  return (
    <div className="flex items-start gap-3 rounded-lg border bg-muted/25 p-4">
      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-background text-primary shadow-sm ring-1 ring-border">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">{commitmentTitle(commitment)}</p>
            {!compact && (
              <p className="mt-1 text-sm text-muted-foreground">
                Ends {new Date(commitment.epochEnd).toLocaleDateString()}
              </p>
            )}
          </div>
          <Badge variant={commitment.state === "COMPLETED" ? "success" : "secondary"}>
            {commitmentStatus(commitment.state)}
          </Badge>
        </div>
      </div>
    </div>
  );
}
