import {
    LoaderCircle,
} from "lucide-react";

import {
    useExecution,
} from "@aurora-is-near/intents-connect/react";

import {
    Button,
} from "@/components/ui/button";
import {
    diagnostics,
} from "@/lib/diagnostics";

type Execution =
    ReturnType<typeof useExecution>;

type ExecutionPlan =
    Parameters<Execution["run"]>[0];

interface AuroraIntentsExecutionProps {
    readonly plan: ExecutionPlan;
}

export function AuroraIntentsExecution({
    plan,
}: AuroraIntentsExecutionProps) {
    const execution = useExecution({
        onEvent: (event) => {
            diagnostics.info(
                "funding.intents_event",
                {
                    event,
                },
            );
        },
    });

    return (
        <div className="space-y-4">
            <Button
                type="button"
                className="w-full"
                disabled={
                    execution.isBusy
                }
                onClick={() => {
                    void execution.run(plan);
                }}
            >
                {execution.isBusy ? (
                    <>
                        <LoaderCircle
                            className="size-4 animate-spin"
                        />

                        {phaseLabel(
                            execution.phase,
                        )}
                    </>
                ) : (
                    "Continue"
                )}
            </Button>

            {execution.depositAddress ? (
                <div className="rounded-lg border bg-muted/20 p-4">
                    <p className="text-sm font-medium">
                        Deposit ready
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                        Kept is ready to move
                        your funds.
                    </p>
                </div>
            ) : null}

            {execution.recovery?.kind ===
                "retry-transfer" ? (
                <div className="space-y-2 rounded-lg border p-4">
                    <p className="text-sm font-medium">
                        Transfer interrupted
                    </p>

                    <p className="text-sm text-muted-foreground">
                        Your funds are safe.
                        Retry the transfer to
                        continue.
                    </p>

                    <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                            void execution.retryDeposit();
                        }}
                    >
                        Retry transfer
                    </Button>
                </div>
            ) : null}
        </div>
    );
}

function phaseLabel(
    phase: string,
): string {
    switch (phase) {
        case "idle":
            return "Continue";

        default:
            return "Moving funds…";
    }
}