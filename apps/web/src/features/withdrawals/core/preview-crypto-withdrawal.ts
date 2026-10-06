import type {
    createExecutionRunner,
} from "@aurora-is-near/intents-connect";

import type {
    FundingAsset,
    FundingAssetsResolver,
} from "@/features/funding/intents/core/funding-assets";

import {
    diagnostics,
} from "@/lib/diagnostics";

import {
    createKeptWithdrawalPlan,
} from "@/features/withdrawals/core/kept-withdrawal-plan";

type ExecutionRunner =
    ReturnType<
        typeof createExecutionRunner
    >;

interface PreviewCryptoWithdrawalInput {
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

export async function previewCryptoWithdrawal({
    runner,
    amount,
    recipient,
    destinationAsset,
    resolveFundingAssets,
}: PreviewCryptoWithdrawalInput) {
    try {
        const plan =
            await createKeptWithdrawalPlan({
                amount,
                recipient,
                destinationAsset,
                resolveFundingAssets,
            });

        const preview =
            await runner.preview(
                plan,
            );

        diagnostics.info(
            "withdrawal.intents_preview_ready",
            {
                amount:
                    amount.toString(),

                destinationAsset:
                    destinationAsset.assetId,
            },
        );

        return {
            plan,
            preview,
        };
    } catch (cause) {
        diagnostics.error(
            "withdrawal.intents_preview_failed",
            cause,
        );

        throw cause;
    }
}