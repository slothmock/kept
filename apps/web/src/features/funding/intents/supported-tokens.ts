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

const BASE_USDC_ADDRESS =
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

export interface FundingAsset {
    readonly assetId: string;
    readonly symbol: string;
    readonly blockchain: string;
    readonly contractAddress: string;
    readonly decimals: number;
}

export interface KeptFundingAssets {
    readonly origin: FundingAsset;
    readonly destination: FundingAsset;
}

function toFundingAsset(
    token: SupportedToken | undefined,
): FundingAsset | null {
    if (
        !token ||
        typeof token.assetId !== "string" ||
        typeof token.symbol !== "string" ||
        typeof token.blockchain !== "string" ||
        typeof token.contractAddress !== "string" ||
        typeof token.decimals !== "number"
    ) {
        return null;
    }

    return {
        assetId:
            token.assetId,

        symbol:
            token.symbol,

        blockchain:
            token.blockchain,

        contractAddress:
            token.contractAddress,

        decimals:
            token.decimals,
    };
}

export async function resolveKeptFundingAssets():
    Promise<KeptFundingAssets> {
    try {
        const result =
            await intentsConnectApi
                .listSupportedTokens();

        const originToken =
            result.in?.find(
                (token) =>
                    token.blockchain === "base" &&
                    token.symbol === "USDC" &&
                    token.contractAddress?.toLowerCase() ===
                    BASE_USDC_ADDRESS,
            );

        const destinationToken =
            result.out?.find(
                (token) =>
                    token.blockchain === "monad" &&
                    token.symbol === "USDC",
            );

        const origin =
            toFundingAsset(
                originToken,
            );

        const destination =
            toFundingAsset(
                destinationToken,
            );

        if (!origin) {
            throw new Error(
                "Base USDC is not currently supported by Aurora Intents.",
            );
        }

        if (!destination) {
            throw new Error(
                "Monad USDC is not currently supported by Aurora Intents.",
            );
        }

        return {
            origin,
            destination,
        };
    } catch (cause) {
        diagnostics.error(
            "funding.intents_assets_failed",
            cause,
        );

        if (cause instanceof Error) {
            throw cause;
        }

        throw new Error(
            consumerErrorMessage(
                cause,
                "We couldn't load the funding route. Try again.",
            ),
            { cause },
        );
    }
}