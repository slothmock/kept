import type {
    createExecutionRunner,
} from "@aurora-is-near/intents-connect";

import {
    diagnostics,
} from "@/lib/diagnostics";

import {
    createKeptWithdrawalPlan,
} from "./kept-withdrawal-plan";

import type {
    FundingAsset,
} from "@/application/money-movement/funding-assets";

type ExecutionRunner =
    ReturnType<
        typeof createExecutionRunner
    >;

interface ExecuteCryptoWithdrawalInput {
    readonly runner:
        ExecutionRunner;

    readonly amount:
        bigint;

    readonly recipient:
        string;

    readonly destinationAsset:
        FundingAsset;
}

export async function executeCryptoWithdrawal({
    runner,
    amount,
    recipient,
    destinationAsset,
}: ExecuteCryptoWithdrawalInput) {
    try {
        const plan =
            await createKeptWithdrawalPlan({
                amount,
                recipient,
                destinationAsset,
            });

        const execution =
            await runner.run(
                plan,
            );

        diagnostics.info(
            "withdrawal.intents_execution_complete",
            {
                amount:
                    amount.toString(),

                destinationAsset:
                    destinationAsset.assetId,
            },
        );

        return execution;
    } catch (
        cause
    ) {
        diagnostics.error(
            "withdrawal.intents_execution_failed",
            cause,
        );

        throw cause;
    }
}