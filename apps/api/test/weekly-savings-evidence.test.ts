import {
    describe,
    expect,
    it,
    vi,
} from "vitest";

import {
    PersistenceWeeklySavingsEvidenceSource,
} from "../src/verifier/weekly-savings-evidence.js";

const startAt =
    new Date(
        "2026-09-01T00:00:00.000Z",
    );

const endAt =
    new Date(
        "2026-09-08T00:00:00.000Z",
    );

const midpoint =
    new Date(
        "2026-09-04T12:00:00.000Z",
    );

const wallet =
    "0x0000000000000000000000000000000000000001";

function createDependencies(input?: {
    openingShares?: bigint;
    deltas?: readonly {
        readonly id: string;
        readonly shareDeltaAtomic: string;
        readonly createdAt: Date;
    }[];
    netAssets?: bigint;
    convert?: (
        shares: bigint,
    ) => bigint;
}) {
    const repository = {
        findPrimaryWalletForOwnerOnChain:
            vi.fn(
                async (): Promise<{
                    readonly address: string;
                } | null> => ({
                    address: wallet,
                }),
            ),

        getGoalAllocatedSharesAt:
            vi.fn(
                async () =>
                    (
                        input?.openingShares
                        ?? 0n
                    ).toString(),
            ),

        listGoalAllocationDeltasForPeriod:
            vi.fn(
                async () =>
                    input?.deltas ?? [],
            ),
    };

    const vaultShares = {
        readShares:
            vi.fn(async () => 0n),

        convertToAssets:
            vi.fn(
                async (shares: bigint) =>
                    input?.convert
                        ? input.convert(shares)
                        : shares,
            ),
    };

    const vaultActivity = {
        readActivity:
            vi.fn(
                async () => {
                    const netAssets =
                        input?.netAssets ?? 0n;

                    return {
                        depositedAssets:
                            netAssets > 0n
                                ? netAssets
                                : 0n,

                        withdrawnAssets:
                            netAssets < 0n
                                ? -netAssets
                                : 0n,

                        netAssets,
                    };
                },
            ),
    };

    return {
        repository,
        vaultShares,
        vaultActivity,
    };
}

function createSource(
    dependencies:
        ReturnType<
            typeof createDependencies
        >,
) {
    return new PersistenceWeeklySavingsEvidenceSource(
        {
            repository:
                dependencies.repository,

            vaultShares:
                dependencies.vaultShares,

            vaultActivity:
                dependencies.vaultActivity,

            chainId: 31337n,
        },
    );
}

describe(
    "PersistenceWeeklySavingsEvidenceSource",
    () => {
        it(
            "counts genuine new savings allocated to the goal",
            async () => {
                const dependencies =
                    createDependencies({
                        openingShares:
                            100_000_000n,

                        deltas: [
                            {
                                id: "delta-1",
                                shareDeltaAtomic:
                                    "50000000",
                                createdAt: midpoint,
                            },
                        ],

                        netAssets:
                            50_000_000n,
                    });

                const source =
                    createSource(
                        dependencies,
                    );

                const result =
                    await source.evaluatePeriod({
                        userId: "user-1",
                        goalId: "goal-1",
                        startAt,
                        endAt,
                    });

                expect(
                    result.netSavedAtomic,
                ).toBe(50_000_000n);

                expect(
                    result
                        .averageEligibleBalanceAtomic,
                ).toBe(125_000_000n);
            },
        );

        it(
            "uses account net savings when withdrawals reduce retained savings",
            async () => {
                const dependencies =
                    createDependencies({
                        openingShares:
                            100_000_000n,

                        deltas: [
                            {
                                id: "delta-1",
                                shareDeltaAtomic:
                                    "50000000",
                                createdAt: midpoint,
                            },
                        ],

                        netAssets:
                            40_000_000n,
                    });

                const result =
                    await createSource(
                        dependencies,
                    ).evaluatePeriod({
                        userId: "user-1",
                        goalId: "goal-1",
                        startAt,
                        endAt,
                    });

                expect(
                    result.netSavedAtomic,
                ).toBe(40_000_000n);
            },
        );

        it(
            "does not count goal reallocation as new saving",
            async () => {
                const dependencies =
                    createDependencies({
                        openingShares:
                            100_000_000n,

                        deltas: [
                            {
                                id: "reallocation",
                                shareDeltaAtomic:
                                    "50000000",
                                createdAt: midpoint,
                            },
                        ],

                        // No new capital entered Kept.
                        netAssets: 0n,
                    });

                const result =
                    await createSource(
                        dependencies,
                    ).evaluatePeriod({
                        userId: "user-1",
                        goalId: "goal-1",
                        startAt,
                        endAt,
                    });

                expect(
                    result.netSavedAtomic,
                ).toBe(0n);
            },
        );

        it(
            "does not count deposit and withdrawal cycling as retained saving",
            async () => {
                const dependencies =
                    createDependencies({
                        openingShares:
                            100_000_000n,

                        deltas: [
                            {
                                id: "delta-1",
                                shareDeltaAtomic:
                                    "50000000",
                                createdAt: midpoint,
                            },
                        ],

                        netAssets: 0n,
                    });

                const result =
                    await createSource(
                        dependencies,
                    ).evaluatePeriod({
                        userId: "user-1",
                        goalId: "goal-1",
                        startAt,
                        endAt,
                    });

                expect(
                    result.netSavedAtomic,
                ).toBe(0n);
            },
        );

        it(
            "calculates the time-weighted average across multiple allocation changes",
            async () => {
                const quarter =
                    new Date(
                        "2026-09-02T18:00:00.000Z",
                    );

                const threeQuarters =
                    new Date(
                        "2026-09-06T06:00:00.000Z",
                    );

                const dependencies =
                    createDependencies({
                        openingShares: 100n,

                        deltas: [
                            {
                                id: "delta-1",
                                shareDeltaAtomic:
                                    "100",
                                createdAt: quarter,
                            },
                            {
                                id: "delta-2",
                                shareDeltaAtomic:
                                    "-100",
                                createdAt:
                                    threeQuarters,
                            },
                        ],

                        netAssets: 0n,
                    });

                const result =
                    await createSource(
                        dependencies,
                    ).evaluatePeriod({
                        userId: "user-1",
                        goalId: "goal-1",
                        startAt,
                        endAt,
                    });

                /*
                 * 25% at 100
                 * 50% at 200
                 * 25% at 100
                 *
                 * average = 150
                 */
                expect(
                    result
                        .averageEligibleBalanceAtomic,
                ).toBe(150n);
            },
        );

        it(
            "converts share values to vault assets",
            async () => {
                const dependencies =
                    createDependencies({
                        openingShares: 100n,

                        deltas: [
                            {
                                id: "delta-1",
                                shareDeltaAtomic: "50",
                                createdAt: midpoint,
                            },
                        ],

                        netAssets: 1_000n,

                        convert: (shares) =>
                            shares * 2n,
                    });

                const result =
                    await createSource(
                        dependencies,
                    ).evaluatePeriod({
                        userId: "user-1",
                        goalId: "goal-1",
                        startAt,
                        endAt,
                    });

                // Increase = 50 shares
                // 50 shares × 2 = 100 assets
                expect(
                    result.netSavedAtomic,
                ).toBe(100n);

                // Average = 125 shares
                // 125 × 2 = 250 assets
                expect(
                    result
                        .averageEligibleBalanceAtomic,
                ).toBe(250n);
            },
        );

        it(
            "returns zero qualifying savings when the goal allocation falls",
            async () => {
                const dependencies =
                    createDependencies({
                        openingShares: 100n,

                        deltas: [
                            {
                                id: "delta-1",
                                shareDeltaAtomic:
                                    "-25",
                                createdAt: midpoint,
                            },
                        ],

                        netAssets: 50n,
                    });

                const result =
                    await createSource(
                        dependencies,
                    ).evaluatePeriod({
                        userId: "user-1",
                        goalId: "goal-1",
                        startAt,
                        endAt,
                    });

                expect(
                    result.netSavedAtomic,
                ).toBe(0n);
            },
        );

        it(
            "rejects allocation history that produces a negative balance",
            async () => {
                const dependencies =
                    createDependencies({
                        openingShares: 10n,

                        deltas: [
                            {
                                id: "bad-delta",
                                shareDeltaAtomic:
                                    "-11",
                                createdAt: midpoint,
                            },
                        ],
                    });

                await expect(
                    createSource(
                        dependencies,
                    ).evaluatePeriod({
                        userId: "user-1",
                        goalId: "goal-1",
                        startAt,
                        endAt,
                    }),
                ).rejects.toThrow(
                    "Goal allocation history produced a negative balance",
                );
            },
        );

        it(
            "rejects users without a primary wallet on the configured chain",
            async () => {
                const dependencies =
                    createDependencies();

                dependencies.repository
                    .findPrimaryWalletForOwnerOnChain
                    .mockResolvedValue(null);

                await expect(
                    createSource(
                        dependencies,
                    ).evaluatePeriod({
                        userId: "user-1",
                        goalId: "goal-1",
                        startAt,
                        endAt,
                    }),
                ).rejects.toThrow(
                    "User has no primary wallet for the configured chain",
                );
            },
        );

        it(
            "rejects an invalid period",
            async () => {
                const dependencies =
                    createDependencies();

                await expect(
                    createSource(
                        dependencies,
                    ).evaluatePeriod({
                        userId: "user-1",
                        goalId: "goal-1",
                        startAt: endAt,
                        endAt: startAt,
                    }),
                ).rejects.toThrow(
                    "Weekly savings period is invalid",
                );
            },
        );
    },
);