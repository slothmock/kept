import type { CommitmentDto } from "@/api/kept-api";
import { Activity, PiggyBank } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { commitmentStatus, commitmentTitle } from "../display";

interface CommitmentCardProps {
  readonly commitment: CommitmentDto;
  readonly compact?: boolean;
}

export function CommitmentCard({
  commitment,
  compact = false,
}: CommitmentCardProps) {
  const savings = commitment.definition.code === "WEEKLY_SAVINGS_V1";
  const Icon = savings ? PiggyBank : Activity;

  return (
    <div className={compact ? "" : "rounded-lg border border-border bg-surface p-4"}>
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
          <Icon className="size-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-label font-medium text-foreground">
                {commitmentTitle(commitment)}
              </p>

              {!compact ? (
                <p className="mt-1 text-caption text-muted-foreground">
                  Ends {new Date(commitment.epochEnd).toLocaleDateString()}
                </p>
              ) : null}
            </div>

            <Badge
              variant={
                commitment.state === "COMPLETED"
                  ? "success"
                  : commitment.state === "FAILED"
                    ? "destructive"
                    : commitment.state === "CANCELLED"
                      ? "muted"
                      : "secondary"
              }
            >
              {commitmentStatus(commitment.state)}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
