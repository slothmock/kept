import type {
    SupportedToken,
} from "@aurora-is-near/intents-connect";

import {
    consumerErrorMessage,
} from "@/lib/consumer-error";

import {
    diagnostics,
} from "@/lib/diagnostics";

import {
    intentsConnectApi,
} from "./aurora-api";

export const SUPPORTED_EVM_FUNDING_CHAINS =
    [
        "eth",
        "base",
        "arb",
        "op",
    ] as const;

export const SUPPORTED_SOLANA_FUNDING_CHAINS =
    [
        "sol",
    ] as const;

const SUPPORTED_SOURCE_CHAINS =
    new Set<string>([
        ...SUPPORTED_EVM_FUNDING_CHAINS,
        ...SUPPORTED_SOLANA_FUNDING_CHAINS,
    ]);

import type {
    FundingAsset,
    KeptFundingAssets,
} from "@/features/funding/intents/core/funding-assets";

export type {
    FundingAsset,
    KeptFundingAssets,
} from "@/features/funding/intents/core/funding-assets";

function toFundingAsset(
    token:
        SupportedToken | undefined,
): FundingAsset | null {
    if (
        !token ||
        typeof token.assetId !==
        "string" ||
        typeof token.symbol !==
        "string" ||
        typeof token.blockchain !==
        "string" ||
        typeof token.decimals !==
        "number"
    ) {
        return null;
    }

    const contractAddress =
        typeof token.contractAddress ===
            "string" &&
            token.contractAddress.trim().length >
            0
            ? token.contractAddress.trim()
            : null;

    return {
        assetId:
            token.assetId,

        symbol:
            token.symbol,

        blockchain:
            token.blockchain,

        contractAddress,

        decimals:
            token.decimals,

        kind:
            contractAddress
                ? "token"
                : "native",
    };
}

function isKeptSourceToken(
    token:
        SupportedToken,
): boolean {
    return (
        typeof token.blockchain ===
        "string" &&
        SUPPORTED_SOURCE_CHAINS.has(
            token.blockchain,
        )
    );
}

export async function resolveKeptFundingAssets():
    Promise<KeptFundingAssets> {
    try {
        const result =
            await intentsConnectApi
                .listSupportedTokens();

        const origins =
            result.in
                ?.filter(
                    isKeptSourceToken,
                )
                .map(
                    toFundingAsset,
                )
                .filter(
                    (
                        asset,
                    ): asset is FundingAsset =>
                        asset !==
                        null,
                ) ??
            [];

        const destinationToken =
            result.out?.find(
                (token) =>
                    token.blockchain ===
                    "monad" &&
                    token.symbol ===
                    "USDC",
            );

        const destination =
            toFundingAsset(
                destinationToken,
            );

        if (
            origins.length ===
            0
        ) {
            throw new Error(
                "No supported funding routes are currently available.",
            );
        }

        if (
            !destination
        ) {
            throw new Error(
                "Monad USDC is not currently supported by Aurora Intents.",
            );
        }

        return {
            origins,
            destination,
        };
    } catch (cause) {
        diagnostics.error(
            "funding.intents_assets_failed",
            cause,
        );

        if (
            cause instanceof
            Error
        ) {
            throw cause;
        }

        throw new Error(
            consumerErrorMessage(
                cause,
                "We couldn't load the funding route. Try again.",
            ),
            {
                cause,
            },
        );
    }
}
export async function resolveKeptWithdrawalAsset(input: {
    readonly blockchain: string;
    readonly symbol: string;
}): Promise<FundingAsset> {
    const result = await intentsConnectApi.listSupportedTokens();
    const token = result.out?.find(
        (candidate) =>
            candidate.blockchain === input.blockchain
            && candidate.symbol === input.symbol,
    );
    const asset = toFundingAsset(token);

    if (!asset) {
        throw new Error(
            `${input.symbol} on ${input.blockchain} is not currently supported for withdrawals.`,
        );
    }

    return asset;
}
