import {
    describe,
    expect,
    it,
    vi,
} from "vitest";

import {
    ViemCommitmentSettlementGateway,
} from "../src/verifier/index.js";

import type {
    VerifiableCommitment,
} from "../src/verifier/index.js";

const manager =
    "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6";

const account = {
    address:
        "0x70997970C51812dc3A010C7d01b50E0d17dc79C8",
} as const;

function commitment(
    overrides:
        Partial<VerifiableCommitment> = {},
): VerifiableCommitment {
    return {
        id: "commitment-1",
        userId: "user-1",
        definitionCode:
            "WEEKLY_SAVINGS_V1",
        definitionVersion: 1,
        parameters: {
            targetAmountAtomic:
                "50000000",
            periodDays: 7,
        },
        epochStart:
            new Date(
                "2026-09-01T00:00:00.000Z",
            ),
        epochEnd:
            new Date(
                "2026-09-08T00:00:00.000Z",
            ),
        verificationDeadline:
            new Date(
                "2026-09-09T00:00:00.000Z",
            ),
        state: "ACTIVE",
        stateVersion: 2,
        settlementRef:
            new Uint8Array(32),
        savingsGoalId:
            "goal-1",
        ...overrides,
    };
}

function onchainCommitment(input?: {
    readonly rewardAssets?: bigint;
    readonly status?: number;
}) {
    return [
        "0x1111111111111111111111111111111111111111",
        `0x${"22".repeat(32)}`,
        1n,
        2n,
        3n,
        input?.rewardAssets ?? 0n,
        input?.status ?? 1,
        false,
    ] as const;
}

function settlementRef(
    id: bigint,
): Uint8Array {
    const bytes =
        new Uint8Array(32);

    let value = id;

    for (
        let index = 31;
        index >= 0;
        index -= 1
    ) {
        bytes[index] =
            Number(value & 0xffn);

        value >>= 8n;
    }

    return bytes;
}

function createDependencies(
    receiptStatus:
        "success" | "reverted"
        = "success",
) {
    const publicClient = {
        readContract:
            vi.fn(async () =>
                onchainCommitment({
                    status: 1,
                }),
            ),

        waitForTransactionReceipt:
            vi.fn(async () => ({
                status: receiptStatus,
            })),
    };

    const walletClient = {
        account,

        writeContract:
            vi.fn(
                async () =>
                    `0x${"11".repeat(32)}`,
            ),
    };

    return {
        publicClient,
        walletClient,
    };
}

describe(
    "ViemCommitmentSettlementGateway",
    () => {
        it(
            "submits completion and waits for confirmation",
            async () => {
                const dependencies =
                    createDependencies();

                const gateway =
                    new ViemCommitmentSettlementGateway({
                        publicClient:
                            dependencies.publicClient as never,
                        walletClient:
                            dependencies.walletClient as never,
                        manager,
                    });

                await gateway
                    .completeCommitment({
                        commitment:
                            commitment({
                                settlementRef:
                                    settlementRef(7n),
                            }),
                        rewardAssets:
                            5_000_000n,
                    });

                expect(
                    dependencies.walletClient
                        .writeContract,
                ).toHaveBeenCalledWith(
                    expect.objectContaining({
                        address: manager,
                        functionName:
                            "completeCommitment",
                        args: [
                            7n,
                            5_000_000n,
                        ],
                    }),
                );

                expect(
                    dependencies.publicClient
                        .waitForTransactionReceipt,
                ).toHaveBeenCalledOnce();
            },
        );

        it(
            "submits failure settlement",
            async () => {
                const dependencies =
                    createDependencies();

                const gateway =
                    new ViemCommitmentSettlementGateway({
                        publicClient:
                            dependencies.publicClient as never,
                        walletClient:
                            dependencies.walletClient as never,
                        manager,
                    });

                await gateway
                    .failCommitment({
                        commitment:
                            commitment({
                                settlementRef:
                                    settlementRef(9n),
                            }),
                    });

                expect(
                    dependencies.walletClient
                        .writeContract,
                ).toHaveBeenCalledWith(
                    expect.objectContaining({
                        functionName:
                            "failCommitment",
                        args: [9n],
                    }),
                );
            },
        );

        it(
            "rejects zero reward completion",
            async () => {
                const dependencies =
                    createDependencies();

                const gateway =
                    new ViemCommitmentSettlementGateway({
                        publicClient:
                            dependencies.publicClient as never,
                        walletClient:
                            dependencies.walletClient as never,
                        manager,
                    });

                await expect(
                    gateway.completeCommitment({
                        commitment:
                            commitment({
                                settlementRef:
                                    settlementRef(1n),
                            }),
                        rewardAssets: 0n,
                    }),
                ).rejects.toThrow(
                    "Commitment reward must be positive",
                );
            },
        );

        it(
            "rejects missing settlement reference",
            async () => {
                const dependencies =
                    createDependencies();

                const gateway =
                    new ViemCommitmentSettlementGateway({
                        publicClient:
                            dependencies.publicClient as never,
                        walletClient:
                            dependencies.walletClient as never,
                        manager,
                    });

                await expect(
                    gateway.failCommitment({
                        commitment:
                            commitment({
                                settlementRef: null,
                            }),
                    }),
                ).rejects.toThrow(
                    "Commitment has no settlement reference",
                );
            },
        );

        it(
            "rejects a wallet client without an account",
            async () => {
                const dependencies =
                    createDependencies();

                const gateway =
                    new ViemCommitmentSettlementGateway({
                        publicClient:
                            dependencies.publicClient as never,
                        walletClient: {
                            ...dependencies.walletClient,
                            account: undefined,
                        } as never,
                        manager,
                    });

                await expect(
                    gateway.failCommitment({
                        commitment:
                            commitment({
                                settlementRef:
                                    settlementRef(1n),
                            }),
                    }),
                ).rejects.toThrow(
                    "Verifier wallet has no account",
                );
            },
        );

        it(
            "rejects a reverted completion transaction",
            async () => {
                const dependencies =
                    createDependencies(
                        "reverted",
                    );

                const gateway =
                    new ViemCommitmentSettlementGateway({
                        publicClient:
                            dependencies.publicClient as never,
                        walletClient:
                            dependencies.walletClient as never,
                        manager,
                    });

                await expect(
                    gateway.completeCommitment({
                        commitment:
                            commitment({
                                settlementRef:
                                    settlementRef(3n),
                            }),
                        rewardAssets:
                            5_000_000n,
                    }),
                ).rejects.toThrow(
                    "Commitment completion reverted",
                );
            },
        );

        it(
            "treats an already completed commitment with the same reward as success",
            async () => {
                const writeContract =
                    vi.fn();

                const publicClient = {
                    readContract:
                        vi.fn()
                            .mockResolvedValue(
                                onchainCommitment({
                                    rewardAssets:
                                        5_000_000n,
                                    status: 2,
                                }),
                            ),

                    waitForTransactionReceipt:
                        vi.fn(),
                };

                const gateway =
                    new ViemCommitmentSettlementGateway({
                        publicClient:
                            publicClient as never,
                        walletClient: {
                            account,
                            writeContract,
                        } as never,
                        manager,
                    });

                await expect(
                    gateway.completeCommitment({
                        commitment:
                            commitment({
                                settlementRef:
                                    settlementRef(7n),
                            }),
                        rewardAssets:
                            5_000_000n,
                    }),
                ).resolves.toBeUndefined();

                expect(
                    writeContract,
                ).not.toHaveBeenCalled();
            },
        );

        it(
            "rejects an already completed commitment with a different reward",
            async () => {
                const writeContract =
                    vi.fn();

                const publicClient = {
                    readContract:
                        vi.fn()
                            .mockResolvedValue(
                                onchainCommitment({
                                    rewardAssets:
                                        3_000_000n,
                                    status: 2,
                                }),
                            ),

                    waitForTransactionReceipt:
                        vi.fn(),
                };

                const gateway =
                    new ViemCommitmentSettlementGateway({
                        publicClient:
                            publicClient as never,
                        walletClient: {
                            account,
                            writeContract,
                        } as never,
                        manager,
                    });

                await expect(
                    gateway.completeCommitment({
                        commitment:
                            commitment({
                                settlementRef:
                                    settlementRef(7n),
                            }),
                        rewardAssets:
                            5_000_000n,
                    }),
                ).rejects.toThrow(
                    "already completed with a different reward",
                );

                expect(
                    writeContract,
                ).not.toHaveBeenCalled();
            },
        );

        it(
            "treats an already failed commitment as successful failure settlement",
            async () => {
                const writeContract =
                    vi.fn();

                const publicClient = {
                    readContract:
                        vi.fn()
                            .mockResolvedValue(
                                onchainCommitment({
                                    status: 3,
                                }),
                            ),

                    waitForTransactionReceipt:
                        vi.fn(),
                };

                const gateway =
                    new ViemCommitmentSettlementGateway({
                        publicClient:
                            publicClient as never,
                        walletClient: {
                            account,
                            writeContract,
                        } as never,
                        manager,
                    });

                await expect(
                    gateway.failCommitment({
                        commitment:
                            commitment({
                                settlementRef:
                                    settlementRef(7n),
                            }),
                    }),
                ).resolves.toBeUndefined();

                expect(
                    writeContract,
                ).not.toHaveBeenCalled();
            },
        );

        it(
            "recovers when completion write throws but chain is already completed",
            async () => {
                const publicClient = {
                    readContract:
                        vi.fn()
                            .mockResolvedValueOnce(
                                onchainCommitment({
                                    status: 1,
                                }),
                            )
                            .mockResolvedValueOnce(
                                onchainCommitment({
                                    rewardAssets:
                                        5_000_000n,
                                    status: 2,
                                }),
                            ),

                    waitForTransactionReceipt:
                        vi.fn(),
                };

                const writeContract =
                    vi.fn()
                        .mockRejectedValue(
                            new Error(
                                "CommitmentNotActive",
                            ),
                        );

                const gateway =
                    new ViemCommitmentSettlementGateway({
                        publicClient:
                            publicClient as never,
                        walletClient: {
                            account,
                            writeContract,
                        } as never,
                        manager,
                    });

                await expect(
                    gateway.completeCommitment({
                        commitment:
                            commitment({
                                settlementRef:
                                    settlementRef(7n),
                            }),
                        rewardAssets:
                            5_000_000n,
                    }),
                ).resolves.toBeUndefined();

                expect(
                    writeContract,
                ).toHaveBeenCalledTimes(1);

                expect(
                    publicClient.readContract,
                ).toHaveBeenCalledTimes(2);
            },
        );

        it(
            "recovers when failure write throws but chain is already failed",
            async () => {
                const publicClient = {
                    readContract:
                        vi.fn()
                            .mockResolvedValueOnce(
                                onchainCommitment({
                                    status: 1,
                                }),
                            )
                            .mockResolvedValueOnce(
                                onchainCommitment({
                                    status: 3,
                                }),
                            ),

                    waitForTransactionReceipt:
                        vi.fn(),
                };

                const writeContract =
                    vi.fn()
                        .mockRejectedValue(
                            new Error(
                                "CommitmentNotActive",
                            ),
                        );

                const gateway =
                    new ViemCommitmentSettlementGateway({
                        publicClient:
                            publicClient as never,
                        walletClient: {
                            account,
                            writeContract,
                        } as never,
                        manager,
                    });

                await expect(
                    gateway.failCommitment({
                        commitment:
                            commitment({
                                settlementRef:
                                    settlementRef(7n),
                            }),
                    }),
                ).resolves.toBeUndefined();

                expect(
                    writeContract,
                ).toHaveBeenCalledTimes(1);

                expect(
                    publicClient.readContract,
                ).toHaveBeenCalledTimes(2);
            },
        );

        it(
            "rejects completion when the commitment is already failed",
            async () => {
                const writeContract =
                    vi.fn();

                const publicClient = {
                    readContract:
                        vi.fn()
                            .mockResolvedValue(
                                onchainCommitment({
                                    status: 3,
                                }),
                            ),

                    waitForTransactionReceipt:
                        vi.fn(),
                };

                const gateway =
                    new ViemCommitmentSettlementGateway({
                        publicClient:
                            publicClient as never,
                        walletClient: {
                            account,
                            writeContract,
                        } as never,
                        manager,
                    });

                await expect(
                    gateway.completeCommitment({
                        commitment:
                            commitment({
                                settlementRef:
                                    settlementRef(7n),
                            }),
                        rewardAssets:
                            5_000_000n,
                    }),
                ).rejects.toThrow(
                    "cannot be completed from onchain status 3",
                );

                expect(
                    writeContract,
                ).not.toHaveBeenCalled();
            },
        );

        it(
            "rejects failure when the commitment is already completed",
            async () => {
                const writeContract =
                    vi.fn();

                const publicClient = {
                    readContract:
                        vi.fn()
                            .mockResolvedValue(
                                onchainCommitment({
                                    rewardAssets:
                                        5_000_000n,
                                    status: 2,
                                }),
                            ),

                    waitForTransactionReceipt:
                        vi.fn(),
                };

                const gateway =
                    new ViemCommitmentSettlementGateway({
                        publicClient:
                            publicClient as never,
                        walletClient: {
                            account,
                            writeContract,
                        } as never,
                        manager,
                    });

                await expect(
                    gateway.failCommitment({
                        commitment:
                            commitment({
                                settlementRef:
                                    settlementRef(7n),
                            }),
                    }),
                ).rejects.toThrow(
                    "cannot be failed from onchain status 2",
                );

                expect(
                    writeContract,
                ).not.toHaveBeenCalled();
            },
        );
    },
);