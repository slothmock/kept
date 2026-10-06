import type {
    createExecutionRunner,
} from "@aurora-is-near/intents-connect";

import {
    diagnostics,
} from "@/lib/diagnostics";

import {
    createKeptWithdrawalPlan,
} from "@/features/withdrawals/core/kept-withdrawal-plan";

import type {
    FundingAsset,
    FundingAssetsResolver,
} from "@/features/funding/intents/core/funding-assets";

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

    readonly resolveFundingAssets:
        FundingAssetsResolver;
}

export async function executeCryptoWithdrawal({
    runner,
    amount,
    recipient,
    destinationAsset,
    resolveFundingAssets,
}: ExecuteCryptoWithdrawalInput) {
    try {
        const plan =
            await createKeptWithdrawalPlan({
                amount,
                recipient,
                destinationAsset,
                resolveFundingAssets,
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