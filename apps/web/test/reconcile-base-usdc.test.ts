import {
    describe,
    expect,
    it,
    vi,
} from "vitest";

import {
    waitForBaseUsdcIncrease,
} from "../src/features/funding/reconcile-base-usdc";

const address =
    "0x0000000000000000000000000000000000000001" as const;

describe(
    "Base USDC funding reconciliation",
    () => {
        it(
            "returns the exact increase in the wallet balance",
            async () => {
                const balances = [
                    10_000_000n,
                    10_000_000n,
                    29_500_000n,
                ];

                const readBalance =
                    vi.fn(
                        async () =>
                            balances.shift()
                            ?? 29_500_000n,
                    );

                const sleep =
                    vi.fn(
                        async () => undefined,
                    );

                await expect(
                    waitForBaseUsdcIncrease({
                        address,
                        startingBalance:
                            10_000_000n,
                        readBalance,
                        sleep,
                    }),
                ).resolves.toBe(
                    19_500_000n,
                );

                expect(
                    readBalance,
                ).toHaveBeenCalledTimes(
                    3,
                );

                expect(
                    sleep,
                ).toHaveBeenCalledTimes(
                    2,
                );
            },
        );

        it(
            "returns immediately when the balance has already increased",
            async () => {
                const readBalance =
                    vi.fn(
                        async () =>
                            30_000_000n,
                    );

                const sleep =
                    vi.fn(
                        async () => undefined,
                    );

                await expect(
                    waitForBaseUsdcIncrease({
                        address,
                        startingBalance:
                            10_000_000n,
                        readBalance,
                        sleep,
                    }),
                ).resolves.toBe(
                    20_000_000n,
                );

                expect(
                    readBalance,
                ).toHaveBeenCalledOnce();

                expect(
                    sleep,
                ).not.toHaveBeenCalled();
            },
        );

        it(
            "does not count an existing balance as newly received funds",
            async () => {
                const readBalance =
                    vi.fn()
                        .mockResolvedValueOnce(
                            50_000_000n,
                        )
                        .mockResolvedValueOnce(
                            50_000_000n,
                        )
                        .mockResolvedValueOnce(
                            55_000_000n,
                        );

                await expect(
                    waitForBaseUsdcIncrease({
                        address,
                        startingBalance:
                            50_000_000n,
                        readBalance,
                        sleep:
                            async () => undefined,
                    }),
                ).resolves.toBe(
                    5_000_000n,
                );
            },
        );

        it(
            "fails when no funds arrive within the configured attempts",
            async () => {
                const readBalance =
                    vi.fn(
                        async () =>
                            10_000_000n,
                    );

                const sleep =
                    vi.fn(
                        async () => undefined,
                    );

                await expect(
                    waitForBaseUsdcIncrease({
                        address,
                        startingBalance:
                            10_000_000n,
                        readBalance,
                        attempts:
                            3,
                        sleep,
                    }),
                ).rejects.toThrow(
                    "Your purchase was confirmed, but the funds haven't appeared yet.",
                );

                expect(
                    readBalance,
                ).toHaveBeenCalledTimes(
                    3,
                );

                expect(
                    sleep,
                ).toHaveBeenCalledTimes(
                    2,
                );
            },
        );

        it(
            "propagates balance read failures",
            async () => {
                const error =
                    new Error(
                        "Base RPC unavailable",
                    );

                const readBalance =
                    vi.fn(
                        async () => {
                            throw error;
                        },
                    );

                await expect(
                    waitForBaseUsdcIncrease({
                        address,
                        startingBalance:
                            10_000_000n,
                        readBalance,
                    }),
                ).rejects.toBe(
                    error,
                );
            },
        );
    },
);