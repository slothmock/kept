import type {
    createExecutionRunner,
} from "@aurora-is-near/intents-connect";

import {
    diagnostics,
} from "@/lib/diagnostics";
import {
    createKeptFundingPlan,
} from "@/application/money-movement/kept-funding-plan";
import type { FundingAsset } from "@/features/funding/intents/supported-tokens";

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

    readonly sourceAsset:
    FundingAsset;
}

export async function executeKeptFunding({
    runner,
    amount,
    walletAddress,
    sourceAsset,
}: ExecuteKeptFundingInput) {
    try {
        const plan =
            await createKeptFundingPlan({
                amount,
                walletAddress,
                sourceAsset,
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