import { randomUUID } from "node:crypto";

import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "vitest";

import {
    createPublicClient,
    createWalletClient,
    http,
    keccak256,
    toBytes,
    type Address,
} from "viem";

import {
    privateKeyToAccount,
} from "viem/accounts";

import {
    connectDatabase,
    type DatabaseConnection,
} from "../src/db/client.js";

import {
    migrateDatabase,
} from "../src/db/migrate.js";

import {
    KeptPersistenceService,
} from "../src/persistence/index.js";

import {
    KeptRepository,
} from "../src/persistence/repository.js";

import {
    commitmentManagerReadAbi,
} from "../src/commitment-settlement.js";

import {
    CommitmentVerificationWorker,
    CommitmentVerifier,
    FixedRewardPolicy,
    PersistenceVerificationStore,
    ViemCommitmentSettlementGateway,
} from "../src/verifier/index.js";

const ENABLED =
    process.env.ENABLE_LOCAL_ANVIL
    === "true";

const describeAnvil =
    ENABLED
        ? describe.sequential
        : describe.skip;

const RPC_URL =
    process.env.MONAD_RPC_URL
    ?? "http://127.0.0.1:8545";

const CHAIN_ID =
    31_337;

const TEST_DATABASE_URL =
    process.env.TEST_DATABASE_URL
    ?? "postgresql://kept:kept_local_dev@127.0.0.1:55432/kept_test";

const MANAGER =
    (
        process.env.COMMITMENT_MANAGER_ADDRESS
        ?? "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6"
    ) as Address;

// Anvil default account 0.
//
// This account creates the commitment.
const USER_PRIVATE_KEY =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// Anvil default account 1.
//
// This should match the verifier role on the
// locally deployed CommitmentManager.
const VERIFIER_PRIVATE_KEY =
    (
        process.env.COMMITMENT_VERIFIER_PRIVATE_KEY
        ?? "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
    ) as `0x${string}`;

const userAccount =
    privateKeyToAccount(
        USER_PRIVATE_KEY,
    );

const verifierAccount =
    privateKeyToAccount(
        VERIFIER_PRIVATE_KEY,
    );

const publicClient =
    createPublicClient({
        transport:
            http(RPC_URL),
    });

const userWallet =
    createWalletClient({
        account:
            userAccount,

        transport:
            http(RPC_URL),
    });

const verifierWallet =
    createWalletClient({
        account:
            verifierAccount,

        transport:
            http(RPC_URL),
    });

const createCommitmentAbi = [
    {
        type: "function",
        name: "createCommitment",
        stateMutability:
            "nonpayable",
        inputs: [
            {
                name: "referenceId",
                type: "bytes32",
            },
            {
                name: "startAt",
                type: "uint64",
            },
            {
                name: "endAt",
                type: "uint64",
            },
        ],
        outputs: [
            {
                name: "commitmentId",
                type: "uint256",
            },
        ],
    },
] as const;

let connection:
    DatabaseConnection;

let service:
    KeptPersistenceService;

let repository:
    KeptRepository;

async function resetDatabase():
    Promise<void> {
    const databaseName =
        decodeURIComponent(
            new URL(
                TEST_DATABASE_URL,
            ).pathname.slice(1),
        );

    if (
        !databaseName.endsWith(
            "_test",
        )
    ) {
        throw new Error(
            "Refusing to reset a database whose name does not end in _test",
        );
    }

    const { Pool } =
        await import("pg");

    const pool =
        new Pool({
            connectionString:
                TEST_DATABASE_URL,
        });

    try {
        await pool.query(
            "DROP SCHEMA IF EXISTS drizzle CASCADE",
        );

        await pool.query(
            "DROP SCHEMA IF EXISTS public CASCADE",
        );

        await pool.query(
            "CREATE SCHEMA public",
        );
    } finally {
        await pool.end();
    }
}

async function createUserAndGoal() {
    const user =
        await service.createUser({
            privyUserId:
                `privy:worker-anvil:${randomUUID()}`,

            displayName:
                "Worker Anvil Test",
        });

    await service.createWallet({
        userId:
            user.id,

        walletKind:
            "PRIVY_EMBEDDED_MONAD",

        chainId:
            CHAIN_ID.toString(),

        address:
            userAccount.address,

        isPrimary:
            true,
    });

    const goal =
        await service.createGoal({
            userId:
                user.id,

            idempotencyKey:
                randomUUID(),

            name:
                "Worker test goal",

            targetAmountAtomic:
                "100000000",

            targetDate:
                null,
        });

    return {
        user,
        goal,
    };
}

async function createActiveCommitment(
    input: {
        readonly qualifies:
        boolean;
    },
) {
    const {
        user,
        goal,
    } =
        await createUserAndGoal();

    const latestBlock =
        await publicClient.getBlock();

    const baseTimestamp =
        latestBlock.timestamp
            > BigInt(
                Math.floor(
                    Date.now()
                    / 1000,
                ),
            )
            ? latestBlock.timestamp
            : BigInt(
                Math.floor(
                    Date.now()
                    / 1000,
                ),
            );

    const startAt =
        baseTimestamp
        + 60n;

    const endAt =
        startAt
        + 7n * 24n * 60n * 60n;

    const verificationDeadline =
        endAt
        + 24n * 60n * 60n;

    const draft =
        await service
            .createCommitmentDraft({
                userId:
                    user.id,

                goalId:
                    goal.id,

                idempotencyKey:
                    randomUUID(),

                definition: {
                    code:
                        "WEEKLY_SAVINGS_V1",

                    version:
                        1,
                },

                parameters: {
                    targetAmountAtomic:
                        "25000000",

                    periodDays:
                        7,
                },

                epochStart:
                    new Date(
                        Number(
                            startAt
                            * 1000n,
                        ),
                    ).toISOString(),

                epochEnd:
                    new Date(
                        Number(
                            endAt
                            * 1000n,
                        ),
                    ).toISOString(),

                verificationDeadline:
                    new Date(
                        Number(
                            verificationDeadline
                            * 1000n,
                        ),
                    ).toISOString(),
            });

    const referenceId =
        keccak256(
            toBytes(
                draft.id,
            ),
        );

    const createHash =
        await userWallet
            .writeContract({
                account:
                    userAccount,

                address:
                    MANAGER,

                abi:
                    createCommitmentAbi,

                functionName:
                    "createCommitment",

                args: [
                    referenceId,
                    startAt,
                    endAt,
                ],

                chain:
                    null,
            });

    await publicClient
        .waitForTransactionReceipt({
            hash:
                createHash,
        });

    // Read the newest commitment id from the
    // contract's public counter/state.
    //
    // If your contract exposes a different
    // counter name, adjust this helper only.
    const createdLogs =
        await publicClient.getLogs({
            address:
                MANAGER,

            event: {
                type: "event",
                name:
                    "CommitmentCreated",

                inputs: [
                    {
                        name:
                            "commitmentId",
                        type:
                            "uint256",
                        indexed:
                            true,
                    },
                    {
                        name:
                            "owner",
                        type:
                            "address",
                        indexed:
                            true,
                    },
                    {
                        name:
                            "referenceId",
                        type:
                            "bytes32",
                        indexed:
                            true,
                    },
                    {
                        name:
                            "startAt",
                        type:
                            "uint64",
                        indexed:
                            false,
                    },
                    {
                        name:
                            "endAt",
                        type:
                            "uint64",
                        indexed:
                            false,
                    },
                ],
            },

            args: {
                owner:
                    userAccount.address,

                referenceId,
            },

            fromBlock:
                latestBlock.number,
        });

    const created =
        createdLogs.at(-1);

    if (
        !created
        || created.args
            .commitmentId
        === undefined
    ) {
        throw new Error(
            "Could not resolve created commitment ID",
        );
    }

    const onchainCommitmentId =
        created.args
            .commitmentId;

    await service.activateCommitment({
        userId:
            user.id,

        commitmentId:
            draft.id,

        expectedVersion:
            draft.stateVersion,

        onchainCommitmentId:
            onchainCommitmentId
                .toString(),

        settlementOwner:
            userAccount.address,

        settlementChainId:
            CHAIN_ID,

        settlementStatus:
            1,

        idempotencyKey:
            randomUUID(),
    });

    return {
        user,
        goal,
        draft,
        onchainCommitmentId,
        startAt,
        endAt,
        verificationDeadline,
        qualifies:
            input.qualifies,
    };
}

async function warpTo(
    timestamp:
        bigint,
): Promise<void> {
    await publicClient.request({
        method:
            "evm_setNextBlockTimestamp" as never,

        params: [
            Number(
                timestamp,
            ),
        ] as never,
    });

    await publicClient.request({
        method:
            "evm_mine" as never,

        params:
            [] as never,
    });
}

describeAnvil(
    "CommitmentVerificationWorker Anvil integration",
    () => {
        beforeAll(
            async () => {
                await resetDatabase();

                await migrateDatabase(
                    TEST_DATABASE_URL,
                );

                connection =
                    connectDatabase(
                        TEST_DATABASE_URL,
                    );

                service =
                    new KeptPersistenceService(
                        connection.db,
                    );

                repository =
                    new KeptRepository(
                        connection.db,
                    );
            },
        );

        beforeEach(
            async () => {
                await connection
                    .pool.query(
                        [
                            "TRUNCATE TABLE",
                            "idempotency_records,",
                            "goal_share_allocations,",
                            "user_commitments,",
                            "savings_goals,",
                            "wallets,",
                            "users",
                            "CASCADE",
                        ].join(" "),
                    );
            },
        );

        afterAll(
            async () => {
                if (
                    connection
                ) {
                    await connection
                        .close();
                }
            },
        );

        it(
            "automatically completes an ended qualifying weekly savings commitment",
            async () => {
                const fixture =
                    await createActiveCommitment({
                        qualifies:
                            true,
                    });

                const settlement =
                    new ViemCommitmentSettlementGateway({
                        publicClient,

                        walletClient:
                            verifierWallet,

                        manager:
                            MANAGER,
                    });

                const verifier =
                    new CommitmentVerifier({
                        store:
                            new PersistenceVerificationStore(
                                connection.db,
                            ),

                        weeklySavings: {
                            evaluatePeriod:
                                async () => ({
                                    netSavedAtomic:
                                        25_000_000n,

                                    averageEligibleBalanceAtomic:
                                        25_000_000n,
                                }),
                        },

                        activity: {
                            async countActivities() {
                                throw new Error(
                                    "not used",
                                );
                            },
                        },

                        settlement,

                        rewards:
                            new FixedRewardPolicy(
                                5_000_000n,
                            ),

                        now:
                            () =>
                                new Date(
                                    Number(
                                        (
                                            fixture.endAt
                                            + 1n
                                        )
                                        * 1000n,
                                    ),
                                ),
                    });

                const worker =
                    new CommitmentVerificationWorker({
                        repository,

                        verifier,

                        batchSize:
                            50,
                    });

                await warpTo(
                    fixture.endAt
                    + 1n,
                );

                const workerNow =
                    new Date(
                        Number(
                            (
                                fixture.endAt
                                + 1n
                            )
                            * 1000n,
                        ),
                    );

                const result =
                    await worker.runOnce(
                        workerNow,
                    );

                expect(
                    result,
                ).toEqual({
                    checked:
                        1,

                    failed:
                        0,
                });

                const stored =
                    await repository
                        .findCommitment(
                            fixture.draft.id,
                        );

                expect(
                    stored?.state,
                ).toBe(
                    "COMPLETED",
                );

                const onchain =
                    await publicClient
                        .readContract({
                            address:
                                MANAGER,

                            abi:
                                commitmentManagerReadAbi,

                            functionName:
                                "commitments",

                            args: [
                                fixture
                                    .onchainCommitmentId,
                            ],
                        });

                expect(
                    onchain[5],
                ).toBe(
                    5_000_000n,
                );

                expect(
                    onchain[6],
                ).toBe(
                    2,
                );
            },
        );

        it(
            "automatically fails an ended weekly savings commitment below target",
            async () => {
                const fixture =
                    await createActiveCommitment({
                        qualifies:
                            false,
                    });

                const settlement =
                    new ViemCommitmentSettlementGateway({
                        publicClient,

                        walletClient:
                            verifierWallet,

                        manager:
                            MANAGER,
                    });

                const verifier =
                    new CommitmentVerifier({
                        store:
                            new PersistenceVerificationStore(
                                connection.db,
                            ),

                        weeklySavings: {
                            evaluatePeriod:
                                async () => ({
                                    netSavedAtomic:
                                        10_000_000n,

                                    averageEligibleBalanceAtomic:
                                        10_000_000n,
                                }),
                        },

                        activity: {
                            async countActivities() {
                                throw new Error(
                                    "not used",
                                );
                            },
                        },

                        settlement,

                        rewards:
                            new FixedRewardPolicy(
                                5_000_000n,
                            ),

                        now:
                            () =>
                                new Date(
                                    Number(
                                        (
                                            fixture.endAt
                                            + 1n
                                        )
                                        * 1000n,
                                    ),
                                ),
                    });

                const worker =
                    new CommitmentVerificationWorker({
                        repository,

                        verifier,

                        batchSize:
                            50,
                    });

                await warpTo(
                    fixture.endAt
                    + 1n,
                );

                const workerNow =
                    new Date(
                        Number(
                            (
                                fixture.endAt
                                + 1n
                            )
                            * 1000n,
                        ),
                    );

                const result =
                    await worker.runOnce(
                        workerNow,
                    );

                expect(
                    result,
                ).toEqual({
                    checked:
                        1,

                    failed:
                        0,
                });

                const stored =
                    await repository
                        .findCommitment(
                            fixture.draft.id,
                        );

                expect(
                    stored?.state,
                ).toBe(
                    "FAILED",
                );

                const onchain =
                    await publicClient
                        .readContract({
                            address:
                                MANAGER,

                            abi:
                                commitmentManagerReadAbi,

                            functionName:
                                "commitments",

                            args: [
                                fixture
                                    .onchainCommitmentId,
                            ],
                        });

                expect(
                    onchain[6],
                ).toBe(
                    3,
                );
            },
        );
    },
);