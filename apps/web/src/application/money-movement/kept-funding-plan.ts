import type {
    Recipe,
} from "@aurora-is-near/intents-connect";

import type {
    FundingAsset,
} from "@/application/money-movement/funding-assets";
import {
    resolveKeptFundingAssets,
} from "@/features/funding/intents/supported-tokens";

export interface KeptFundingRecipeParams {
    readonly recipient:
    string;
}

interface CreateKeptFundingPlanInput {
    readonly amount:
    bigint;

    readonly walletAddress:
    string;

    readonly sourceAsset:
    FundingAsset;
}

export async function createKeptFundingPlan({
    amount,
    walletAddress,
    sourceAsset,
}: CreateKeptFundingPlanInput) {
    const {
        destination,
    } =
        await resolveKeptFundingAssets();

    const destinationTokenAddress =
        destination.contractAddress;

    if (!destinationTokenAddress) {
        throw new Error(
            "Monad USDC is not configured correctly.",
        );
    }

    const recipe:
        Recipe<KeptFundingRecipeParams> = {
        id:
            "kept-funding",

        intent:
            "fund_kept",

        title:
            "Add money to Kept",

        flow:
            "bridge-in",

        type:
            "evm",

        destination: {
            chain:
                "monad",

            assetId:
                destination.assetId,

            tokenAddress:
                destinationTokenAddress,
        },

        buildSteps: (
            {
                amount,
            },
            {
                recipient,
            },
        ) => [
                {
                    to:
                        destinationTokenAddress,

                    functionSignature:
                        "transfer(address,uint256)",

                    parameters: [
                        recipient,
                        amount,
                    ],

                    value:
                        "0",
                },
            ],
    };

    return {
        recipe,

        params: {
            recipient:
                walletAddress,
        },

        quote: {
            originAsset:
                sourceAsset.assetId,

            destinationAsset:
                destination.assetId,

            amount:
                amount.toString(),

            swapType:
                "EXACT_INPUT" as const,

            slippageTolerance:
                100,
        },

        originChain:
            sourceAsset.blockchain,

        originToken: {
            contractAddress:
                sourceAsset.contractAddress ??
                "",

            decimals:
                sourceAsset.decimals,
        },

        depositViaWallet:
            true,
    };
}