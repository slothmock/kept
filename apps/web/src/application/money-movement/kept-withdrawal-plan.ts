import type {
    Recipe,
    SolanaRecipe,
} from "@aurora-is-near/intents-connect";

import {
    createSolanaRecipientAta,
    prepareSolanaSteps,
} from "@aurora-is-near/intents-connect-wallet/solana";

import {
    PublicKey,
    SystemProgram,
} from "@solana/web3.js";

import {
    createTransferCheckedInstruction,
    getAssociatedTokenAddressSync,
} from "@solana/spl-token";

import type {
    FundingAsset,
    FundingAssetsResolver,
} from "@/features/funding/intents/core/funding-assets";
export interface KeptWithdrawalRecipeParams {
    readonly recipient:
    string;
}

interface CreateKeptWithdrawalPlanInput {
    readonly amount:
    bigint;

    readonly recipient:
    string;

    readonly destinationAsset:
    FundingAsset;

    readonly resolveFundingAssets:
    FundingAssetsResolver;
}

function createEvmWithdrawalRecipe(
    destinationAsset: FundingAsset,
): Recipe<KeptWithdrawalRecipeParams> {
    const nativeDestination =
        destinationAsset.kind ===
        "native";

    const destinationTokenAddress =
        destinationAsset.contractAddress;

    if (
        !nativeDestination &&
        !destinationTokenAddress
    ) {
        throw new Error(
            "Destination token is not configured correctly.",
        );
    }

    return {
        id:
            "kept-withdrawal",

        intent:
            "withdraw_from_kept",

        title:
            "Withdraw from Kept",

        flow:
            "bridge-in",

        type:
            "evm",

        destination: {
            chain:
                destinationAsset.blockchain,

            assetId:
                destinationAsset.assetId,

            ...(destinationTokenAddress
                ? {
                    tokenAddress:
                        destinationTokenAddress,
                }
                : {}),
        },

        buildSteps: (
            {
                amount,
            },
            {
                recipient,
            },
        ) => {
            if (
                nativeDestination
            ) {
                return [
                    {
                        to:
                            recipient,

                        functionSignature:
                            "",

                        parameters:
                            [],

                        value:
                            amount,
                    },
                ];
            }

            return [
                {
                    to:
                        destinationTokenAddress!,

                    functionSignature:
                        "transfer(address,uint256)",

                    parameters: [
                        recipient,
                        amount,
                    ],

                    value:
                        "0",
                },
            ];
        },
    };
}

function createSolanaWithdrawalRecipe(
    destinationAsset: FundingAsset,
): SolanaRecipe<KeptWithdrawalRecipeParams> {
    return {
        id:
            "kept-withdrawal-solana",

        intent:
            "withdraw_from_kept",

        title:
            "Withdraw from Kept",

        flow:
            "bridge-in",

        type:
            "solana",

        destination: {
            chain:
                destinationAsset.blockchain,

            assetId:
                destinationAsset.assetId,

            /*
             * RecipeDestination requires this field.
             * Native SOL has no token contract/mint.
             */
            tokenAddress:
                destinationAsset.contractAddress ??
                "",
        },

        buildSteps: async (
            {
                amount,
                intermediary,
            },
            {
                recipient,
            },
        ) => {
            /*
             * Native SOL
             */
            if (
                destinationAsset.kind ===
                "native"
            ) {
                const instruction =
                    SystemProgram.transfer({
                        fromPubkey:
                            new PublicKey(
                                intermediary,
                            ),

                        toPubkey:
                            new PublicKey(
                                recipient,
                            ),

                        lamports:
                            BigInt(
                                amount,
                            ),
                    });

                return prepareSolanaSteps(
                    [
                        instruction,
                    ],
                    {
                        intermediary,
                    },
                );
            }

            /*
             * SPL token
             */
            const mintAddress =
                destinationAsset.contractAddress;

            if (!mintAddress) {
                throw new Error(
                    "Solana token mint is not configured.",
                );
            }

            const mint =
                new PublicKey(
                    mintAddress,
                );

            const intermediaryKey =
                new PublicKey(
                    intermediary,
                );

            /*
             * Aurora gives us a safe idempotent
             * recipient ATA instruction.
             */
            const recipientAta =
                createSolanaRecipientAta({
                    intermediary,
                    recipient,
                    mint:
                        mintAddress,
                });

            /*
             * The intermediary owns the output
             * tokens before the final transfer.
             */
            const intermediaryAta =
                getAssociatedTokenAddressSync(
                    mint,
                    intermediaryKey,
                    true,
                );

            const transfer =
                createTransferCheckedInstruction(
                    intermediaryAta,
                    mint,
                    new PublicKey(
                        recipientAta.address,
                    ),
                    intermediaryKey,
                    BigInt(
                        amount,
                    ),
                    destinationAsset.decimals,
                );

            return prepareSolanaSteps(
                [
                    recipientAta.instruction,
                    transfer,
                ],
                {
                    intermediary,
                },
            );
        },
    };
}

export async function createKeptWithdrawalPlan({
    amount,
    recipient,
    destinationAsset,
    resolveFundingAssets,
}: CreateKeptWithdrawalPlanInput) {
    const {
        destination:
        monadUsdc,
    } =
        await resolveFundingAssets();

    const monadUsdcAddress =
        monadUsdc.contractAddress;

    if (!monadUsdcAddress) {
        throw new Error(
            "Monad USDC is not configured correctly.",
        );
    }

    const recipe =
        destinationAsset.blockchain ===
            "sol"
            ? createSolanaWithdrawalRecipe(
                destinationAsset,
            )
            : createEvmWithdrawalRecipe(
                destinationAsset,
            );

    return {
        recipe,

        params: {
            recipient,
        },

        quote: {
            originAsset:
                monadUsdc.assetId,

            destinationAsset:
                destinationAsset.assetId,

            amount:
                amount.toString(),

            swapType:
                "EXACT_INPUT" as const,

            slippageTolerance:
                100,
        },

        originChain:
            monadUsdc.blockchain,

        originToken: {
            contractAddress:
                monadUsdcAddress,

            decimals:
                monadUsdc.decimals,
        },

        depositViaWallet:
            true,
    };
}