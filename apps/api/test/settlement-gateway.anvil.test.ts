import {
    createPublicClient,
    createWalletClient,
    getAddress,
    http,
    keccak256,
    toBytes,
    type Address,
} from "viem";

import {
    privateKeyToAccount,
} from "viem/accounts";

import {
    encodeOnchainCommitmentId,
} from "../src/commitment-settlement.js";

import {
    ViemCommitmentSettlementGateway,
} from "../src/verifier/index.js";

import type {
    VerifiableCommitment,
} from "../src/verifier/index.js";

import {
    describe,
    expect,
    it,
} from "vitest";

const enabled =
    process.env.ENABLE_LOCAL_ANVIL === "true";

const integrationDescribe =
    enabled
        ? describe
        : describe.skip;

const managerAbi = [
    {
        type: "function",
        name: "nextCommitmentId",
        stateMutability: "view",
        inputs: [],
        outputs: [
            {
                name: "",
                type: "uint256",
            },
        ],
    },
    {
        type: "function",
        name: "createCommitment",
        stateMutability: "nonpayable",
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
    {
        type: "function",
        name: "commitments",
        stateMutability: "view",
        inputs: [
            {
                name: "commitmentId",
                type: "uint256",
            },
        ],
        outputs: [
            {
                name: "owner",
                type: "address",
            },
            {
                name: "referenceId",
                type: "bytes32",
            },
            {
                name: "createdAt",
                type: "uint64",
            },
            {
                name: "startAt",
                type: "uint64",
            },
            {
                name: "endAt",
                type: "uint64",
            },
            {
                name: "rewardAssets",
                type: "uint256",
            },
            {
                name: "status",
                type: "uint8",
            },
            {
                name: "rewardClaimed",
                type: "bool",
            },
        ],
    },
    {
        type: "error",
        name: "InvalidTimeRange",
        inputs: [],
    },
    {
        type: "error",
        name: "InvalidReferenceId",
        inputs: [],
    },
    {
        type: "error",
        name: "ReferenceAlreadyUsed",
        inputs: [
            {
                name: "referenceId",
                type: "bytes32",
            },
        ],
    },
    {
        type: "error",
        name: "CommitmentNotEnded",
        inputs: [],
    },
    {
        type: "error",
        name: "CommitmentNotActive",
        inputs: [],
    },
] as const;

function requireEnvironment(
    key: string,
): string {
    const value =
        process.env[key]?.trim();

    if (!value) {
        throw new Error(
            `${key} is required for Anvil integration tests`,
        );
    }

    return value;
}

integrationDescribe(
    "ViemCommitmentSettlementGateway Anvil integration",
    () => {
        it(
            "completes a real CommitmentManager commitment",
            async () => {
                const rpcUrl =
                    requireEnvironment(
                        "MONAD_RPC_URL",
                    );

                const manager =
                    getAddress(
                        requireEnvironment(
                            "COMMITMENT_MANAGER_ADDRESS",
                        ),
                    );

                const verifierKey =
                    requireEnvironment(
                        "COMMITMENT_VERIFIER_PRIVATE_KEY",
                    ) as `0x${string}`;

                /*
                 * This account only creates the commitment.
                 * It does not need verifier privileges.
                 */
                const userKey =
                    requireEnvironment(
                        "LOCAL_DEPLOYER_PRIVATE_KEY",
                    ) as `0x${string}`;

                const verifierAccount =
                    privateKeyToAccount(
                        verifierKey,
                    );

                const userAccount =
                    privateKeyToAccount(
                        userKey,
                    );

                const publicClient =
                    createPublicClient({
                        transport:
                            http(rpcUrl),
                    });

                const verifierWallet =
                    createWalletClient({
                        account:
                            verifierAccount,
                        transport:
                            http(rpcUrl),
                    });

                const userWallet =
                    createWalletClient({
                        account: userAccount,
                        transport: http(rpcUrl),
                    });

                const commitmentId =
                    await publicClient
                        .readContract({
                            address: manager,
                            abi: managerAbi,
                            functionName:
                                "nextCommitmentId",
                        });

                const block =
                    await publicClient.getBlock();

                const wallClock =
                    BigInt(
                        Math.floor(Date.now() / 1_000),
                    );

                const baseTimestamp =
                    block.timestamp > wallClock
                        ? block.timestamp
                        : wallClock;

                const startAt =
                    baseTimestamp + 3_600n;

                const endAt =
                    baseTimestamp + 7_200n;

                const offchainId =
                    `anvil-integration-${commitmentId}-${Date.now()}`;

                const referenceId =
                    keccak256(
                        toBytes(offchainId),
                    );

                const createHash =
                    await userWallet
                        .writeContract({
                            address: manager,
                            abi: managerAbi,
                            functionName:
                                "createCommitment",
                            args: [
                                referenceId,
                                startAt,
                                endAt,
                            ],
                            chain: null,
                        });

                const createReceipt =
                    await publicClient
                        .waitForTransactionReceipt({
                            hash: createHash,
                        });

                expect(
                    createReceipt.status,
                ).toBe("success");

                /*
                 * Advance Anvil beyond endAt.
                 */
                await publicClient.request({
                    method:
                        "evm_setNextBlockTimestamp" as never,
                    params: [
                        Number(endAt),
                    ] as never,
                });

                await publicClient.request({
                    method:
                        "evm_mine" as never,
                    params: [] as never,
                });

                const commitment:
                    VerifiableCommitment = {
                    id: offchainId,
                    userId:
                        "anvil-user",
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
                            Number(startAt) * 1_000,
                        ),
                    epochEnd:
                        new Date(
                            Number(endAt) * 1_000,
                        ),
                    verificationDeadline:
                        new Date(
                            Number(
                                endAt + 86_400n,
                            ) * 1_000,
                        ),
                    state: "ACTIVE",
                    stateVersion: 2,
                    settlementRef:
                        encodeOnchainCommitmentId(
                            commitmentId.toString(),
                        ),
                    savingsGoalId:
                        "goal-anvil",
                };

                const gateway =
                    new ViemCommitmentSettlementGateway({
                        publicClient,
                        walletClient:
                            verifierWallet,
                        manager,
                    });

                await gateway
                    .completeCommitment({
                        commitment,
                        rewardAssets:
                            1_000_000n,
                    });

                const record =
                    await publicClient
                        .readContract({
                            address: manager,
                            abi: managerAbi,
                            functionName:
                                "commitments",
                            args: [
                                commitmentId,
                            ],
                        });

                const rewardAssets =
                    record[5];

                const status =
                    record[6];

                expect(
                    rewardAssets,
                ).toBe(1_000_000n);

                /*
                 * CommitmentStatus.Completed = 2
                 */
                expect(
                    Number(status),
                ).toBe(2);
            },
        );
    },
);