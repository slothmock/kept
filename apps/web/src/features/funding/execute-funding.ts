// apps/web/src/features/funding/intents/execute-funding.ts

import type {
    createExecutionRunner,
} from "@aurora-is-near/intents-connect";

import {
    diagnostics,
} from "@/lib/diagnostics";
import {
    createKeptFundingPlan,
} from "@/features/funding/intents/kept-funding-plan";

type ExecutionRunner =
    ReturnType<
        typeof createExecutionRunner
    >;

interface ExecuteKeptFundingInput {
    readonly runner:
        ExecutionRunner;

    readonly amount:
        bigint;

    readonly walletAddress:
        string;
}

export async function executeKeptFunding({
    runner,
    amount,
    walletAddress,
}: ExecuteKeptFundingInput) {
    try {
        const plan =
            await createKeptFundingPlan({
                amount,
                walletAddress,
            });

        const execution =
            await runner.run(
                plan,
            );

        diagnostics.info(
            "funding.intents_execution_complete",
            {
                amount:
                    amount.toString(),
            },
        );

        return execution;
    } catch (cause) {
        diagnostics.error(
            "funding.intents_execution_failed",
            cause,
        );

        throw cause;
    }
}