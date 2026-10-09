import { useEffect, useState } from "react";
import type { GoalActivityDto } from "@/api/kept-api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function GoalActivityPreview({
  goalId,
  loadActivity,
}: {
  readonly goalId: string;
  readonly loadActivity: (goalId: string) => Promise<readonly GoalActivityDto[]>;
}) {
  const [state, setState] = useState<
    { kind: "loading" } |
    { kind: "ready"; items: readonly GoalActivityDto[] } |
    { kind: "error" }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void loadActivity(goalId).then(
      (items) => { if (!cancelled) setState({ kind: "ready", items: items.slice(0, 5) }); },
      () => { if (!cancelled) setState({ kind: "error" }); },
    );
    return () => { cancelled = true; };
  }, [goalId, loadActivity]);

  return (
    <Card className="shadow-none">
      <CardContent className="divide-y divide-border p-0">
        {state.kind === "loading" ? (
          <div className="space-y-3 p-5"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
        ) : state.kind === "error" ? (
          <p className="p-5 text-caption text-muted-foreground" role="alert">Goal activity is unavailable. Try refreshing.</p>
        ) : state.items.length === 0 ? (
          <p className="p-5 text-caption text-muted-foreground">No goal savings movements yet.</p>
        ) : state.items.map((item) => (
          <div className="flex items-center justify-between gap-3 px-5 py-4" key={item.id}>
            <div className="min-w-0">
              <p className="text-label font-medium">{item.kind === "ADDED" ? "Added to goal" : "Removed from goal"}</p>
              <p className="text-caption text-muted-foreground">
                {new Date(item.createdAt).toLocaleDateString()}
              </p>
            </div>
            <span className="text-label tabular-nums">
              {item.amountAtomic === null
                ? "Amount unavailable"
                : `${item.kind === "ADDED" ? "+" : "−"}${(Number(BigInt(item.amountAtomic)) / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
