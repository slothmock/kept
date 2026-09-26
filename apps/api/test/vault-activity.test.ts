import { describe, expect, it, vi } from "vitest";
import {
    createVaultSavingsActivityReader,
} from "../src/vault-activity.js";

const vault =
    "0x0000000000000000000000000000000000000001";

const account =
    "0x0000000000000000000000000000000000000002";

function createClient() {
    const blocks = new Map<bigint, bigint>([
        [0n, 100n],
        [1n, 200n],
        [2n, 300n],
        [3n, 400n],
        [4n, 500n],
    ]);

    return {
        getChainId: vi.fn(async () => 31337),

        getBlockNumber: vi.fn(async () => 4n),

        getBlock: vi.fn(
            async ({
                blockNumber,
            }: {
                blockNumber: bigint;
            }) => ({
                number: blockNumber,
                timestamp:
                    blocks.get(blockNumber)
                    ?? 0n,
            }),
        ),

        getLogs: vi.fn(),
    };
}

describe(
    "createVaultSavingsActivityReader",
    () => {
        it(
            "calculates positive net savings",
            async () => {
                const client = createClient();

                client.getLogs
                    .mockResolvedValueOnce([
                        {
                            args: {
                                owner: account,
                                assets: 25_000_000n,
                                shares: 25_000_000n,
                            },
                        },
                    ])
                    .mockResolvedValueOnce([]);

                const reader =
                    createVaultSavingsActivityReader({
                        publicClient: client,
                        vault,
                        chainId: 31337,
                    });

                const result =
                    await reader.readActivity({
                        account,
                        startAt:
                            new Date(200_000),
                        endAt:
                            new Date(500_000),
                    });

                expect(result).toEqual({
                    depositedAssets: 25_000_000n,
                    withdrawnAssets: 0n,
                    netAssets: 25_000_000n,
                });
            },
        );

        it(
            "subtracts withdrawals from deposits",
            async () => {
                const client = createClient();

                client.getLogs
                    .mockResolvedValueOnce([
                        {
                            args: {
                                owner: account,
                                assets: 25_000_000n,
                                shares: 25_000_000n,
                            },
                        },
                    ])
                    .mockResolvedValueOnce([
                        {
                            args: {
                                owner: account,
                                assets: 10_000_000n,
                                shares: 10_000_000n,
                            },
                        },
                    ]);

                const reader =
                    createVaultSavingsActivityReader({
                        publicClient: client,
                        vault,
                        chainId: 31337,
                    });

                const result =
                    await reader.readActivity({
                        account,
                        startAt:
                            new Date(200_000),
                        endAt:
                            new Date(500_000),
                    });

                expect(result).toEqual({
                    depositedAssets: 25_000_000n,
                    withdrawnAssets: 10_000_000n,
                    netAssets: 15_000_000n,
                });
            },
        );

        it(
            "allows negative net savings",
            async () => {
                const client = createClient();

                client.getLogs
                    .mockResolvedValueOnce([])
                    .mockResolvedValueOnce([
                        {
                            args: {
                                owner: account,
                                assets: 10_000_000n,
                                shares: 10_000_000n,
                            },
                        },
                    ]);

                const reader =
                    createVaultSavingsActivityReader({
                        publicClient: client,
                        vault,
                        chainId: 31337,
                    });

                const result =
                    await reader.readActivity({
                        account,
                        startAt:
                            new Date(200_000),
                        endAt:
                            new Date(500_000),
                    });

                expect(result.netAssets)
                    .toBe(-10_000_000n);
            },
        );

        it(
            "returns zero when no blocks fall in the period",
            async () => {
                const client = createClient();

                const reader =
                    createVaultSavingsActivityReader({
                        publicClient: client,
                        vault,
                        chainId: 31337,
                    });

                const result =
                    await reader.readActivity({
                        account,
                        startAt:
                            new Date(600_000),
                        endAt:
                            new Date(700_000),
                    });

                expect(result).toEqual({
                    depositedAssets: 0n,
                    withdrawnAssets: 0n,
                    netAssets: 0n,
                });

                expect(client.getLogs)
                    .not.toHaveBeenCalled();
            },
        );

        it(
            "rejects chain mismatch",
            async () => {
                const client = createClient();

                client.getChainId
                    .mockResolvedValue(1);

                const reader =
                    createVaultSavingsActivityReader({
                        publicClient: client,
                        vault,
                        chainId: 31337,
                    });

                await expect(
                    reader.readActivity({
                        account,
                        startAt:
                            new Date(200_000),
                        endAt:
                            new Date(500_000),
                    }),
                ).rejects.toThrow(
                    "RPC chain ID does not match configured chain 31337",
                );
            },
        );

        it(
            "rejects an invalid period",
            async () => {
                const client = createClient();

                const reader =
                    createVaultSavingsActivityReader({
                        publicClient: client,
                        vault,
                        chainId: 31337,
                    });

                await expect(
                    reader.readActivity({
                        account,
                        startAt:
                            new Date(500_000),
                        endAt:
                            new Date(200_000),
                    }),
                ).rejects.toThrow(
                    "Vault activity period is invalid",
                );
            },
        );
    },
);