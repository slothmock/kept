import {
    formatUnits,
} from "viem";

import type {
    FundingAsset,
} from "./intents/supported-tokens";

const MINIMUM_BRIDGE_AMOUNT_PATTERN =
    /Amount is too low for bridge, try at least (\d+)/i;

export function fundingTransferErrorMessage(
    error: unknown,
    asset: FundingAsset,
    fallback: string,
): string {
    if (
        error instanceof
        Error
    ) {
        const minimumMatch =
            error.message.match(
                MINIMUM_BRIDGE_AMOUNT_PATTERN,
            );

        if (
            minimumMatch?.[1]
        ) {
            const minimum =
                formatUnits(
                    BigInt(
                        minimumMatch[1],
                    ),
                    asset.decimals,
                );

            return `The amount is below the minimum transfer size. Try at least ${minimum} ${asset.symbol}.`;
        }

        return error.message;
    }

    return fallback;
}
