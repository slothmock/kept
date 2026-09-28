import type {
    Recipe,
} from "@aurora-is-near/intents-connect";

import {
    resolveKeptFundingAssets,
} from "./supported-tokens";

export interface KeptFundingRecipeParams {
    readonly recipient: string;
}

interface CreateKeptFundingPlanInput {
    readonly amount: bigint;
    readonly walletAddress: string;
}

export async function createKeptFundingPlan({
    amount,
    walletAddress,
}: CreateKeptFundingPlanInput) {
    const {
        origin,
        destination,
    } =
        await resolveKeptFundingAssets();

    const recipe: Recipe<KeptFundingRecipeParams> = {
        id: "kept-funding",

        intent: "fund_kept",

        title: "Add money to Kept",

        flow: "bridge-in",

        type: "evm",

        destination: {
            chain: "monad",
            assetId:
                destination.assetId,
            tokenAddress:
                destination.contractAddress,
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
                        destination.contractAddress,

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
                origin.assetId,

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
            "base",

        originToken: {
            contractAddress:
                origin.contractAddress,

            decimals:
                origin.decimals,
        },

        depositViaWallet:
            true,
    };
}