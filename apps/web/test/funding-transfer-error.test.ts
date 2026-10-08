import {
    describe,
    expect,
    it,
} from "vitest";

import {
    fundingTransferErrorMessage,
} from "../src/features/funding/funding-transfer-error.js";

function asset(
    symbol: string,
    decimals: number,
) {
    return {
        assetId:
            `test:${symbol.toLowerCase()}`,

        blockchain:
            "test",

        contractAddress:
            null,

        decimals,

        kind:
            "native" as const,

        symbol,
    };
}

describe(
    "fundingTransferErrorMessage",
    () => {
        it(
            "formats a USDC minimum from atomic units",
            () => {
                expect(
                    fundingTransferErrorMessage(
                        new Error(
                            "Amount is too low for bridge, try at least 10218",
                        ),
                        asset(
                            "USDC",
                            6,
                        ),
                        "fallback",
                    ),
                ).toBe(
                    "The amount is below the minimum transfer size. Try at least 0.010218 USDC.",
                );
            },
        );

        it(
            "uses the selected asset decimals for SOL",
            () => {
                expect(
                    fundingTransferErrorMessage(
                        new Error(
                            "Amount is too low for bridge, try at least 1234567890",
                        ),
                        asset(
                            "SOL",
                            9,
                        ),
                        "fallback",
                    ),
                ).toBe(
                    "The amount is below the minimum transfer size. Try at least 1.23456789 SOL.",
                );
            },
        );

        it(
            "uses the selected asset decimals for ETH",
            () => {
                expect(
                    fundingTransferErrorMessage(
                        new Error(
                            "Amount is too low for bridge, try at least 1000000000000000",
                        ),
                        asset(
                            "ETH",
                            18,
                        ),
                        "fallback",
                    ),
                ).toBe(
                    "The amount is below the minimum transfer size. Try at least 0.001 ETH.",
                );
            },
        );

        it(
            "translates an unavailable quote into consumer-facing copy",
            () => {
                expect(
                    fundingTransferErrorMessage(
                        new Error(
                            "Quote is unavailable",
                        ),
                        asset(
                            "SOL",
                            9,
                        ),
                        "fallback",
                    ),
                ).toBe(
                    "This transfer route isn't available right now. Try again shortly or choose another asset.",
                );
            },
        );

        it(
            "translates a no-quote response into consumer-facing copy",
            () => {
                expect(
                    fundingTransferErrorMessage(
                        new Error(
                            "No quote found",
                        ),
                        asset(
                            "USDC",
                            6,
                        ),
                        "fallback",
                    ),
                ).toBe(
                    "This transfer route isn't available right now. Try again shortly or choose another asset.",
                );
            },
        );

        it(
            "preserves other error messages",
            () => {
                expect(
                    fundingTransferErrorMessage(
                        new Error(
                            "Wallet unavailable",
                        ),
                        asset(
                            "SOL",
                            9,
                        ),
                        "fallback",
                    ),
                ).toBe(
                    "Wallet unavailable",
                );
            },
        );

        it(
            "uses the supplied fallback for non-errors",
            () => {
                expect(
                    fundingTransferErrorMessage(
                        null,
                        asset(
                            "SOL",
                            9,
                        ),
                        "We couldn't prepare your transfer.",
                    ),
                ).toBe(
                    "We couldn't prepare your transfer.",
                );
            },
        );
    },
);
