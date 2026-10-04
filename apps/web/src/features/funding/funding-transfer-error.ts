import {
    formatUnits,
} from "viem";

import type {
    FundingAsset,
} from "./intents/supported-tokens";

const MINIMUM_BRIDGE_AMOUNT_PATTERN =
    /Amount is too low for bridge, try at least (\d+)/i;

const QUOTE_UNAVAILABLE_PATTERN =
    /(?:quote(?: is)? (?:unavailable|not available)|no (?:valid )?quote(?: available| found)?)/i;

const QUOTE_UNAVAILABLE_MESSAGE =
    "This transfer route isn't available right now. Try again shortly or choose another asset.";

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

        if (
            QUOTE_UNAVAILABLE_PATTERN.test(
                error.message,
            )
        ) {
            return QUOTE_UNAVAILABLE_MESSAGE;
        }

        return error.message;
    }

    return fallback;
}
