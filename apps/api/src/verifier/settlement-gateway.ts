import {
    type Address,
    type PublicClient,
    type WalletClient,
} from "viem";

import {
    decodeOnchainCommitmentId,
} from "../commitment-settlement.js";

import type {
    CommitmentSettlementGateway,
    VerifiableCommitment,
} from "./types.js";

const commitmentSettlementAbi = [
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
        type: "function",
        name: "completeCommitment",
        stateMutability: "nonpayable",
        inputs: [
            {
                name: "commitmentId",
                type: "uint256",
            },
            {
                name: "rewardAssets",
                type: "uint256",
            },
        ],
        outputs: [],
    },
    {
        type: "function",
        name: "failCommitment",
        stateMutability: "nonpayable",
        inputs: [
            {
                name: "commitmentId",
                type: "uint256",
            },
        ],
        outputs: [],
    },
] as const;

function requireOnchainCommitmentId(
    commitment: VerifiableCommitment,
): bigint {
    if (!commitment.settlementRef) {
        throw new Error(
            `Commitment has no settlement reference: ${commitment.id}`,
        );
    }

    return BigInt(
        decodeOnchainCommitmentId(
            commitment.settlementRef,
        ),
    );
}

type OnchainCommitmentRecord = readonly [
    Address,
    `0x${string}`,
    bigint,
    bigint,
    bigint,
    bigint,
    number,
    boolean,
];

async function readOnchainCommitment(
    publicClient: PublicClient,
    manager: Address,
    commitmentId: bigint,
): Promise<OnchainCommitmentRecord> {
    const result =
        await publicClient.readContract({
            address: manager,
            abi: commitmentSettlementAbi,
            functionName: "commitments",
            args: [commitmentId],
        });

    if (
        !Array.isArray(result)
        || result.length !== 8
    ) {
        throw new Error(
            `CommitmentManager returned an invalid commitment record: ${commitmentId}`,
        );
    }

    return result as unknown as
        OnchainCommitmentRecord;
}

export class ViemCommitmentSettlementGateway
    implements CommitmentSettlementGateway {
    constructor(
        private readonly dependencies: {
            readonly publicClient:
            PublicClient;
            readonly walletClient:
            WalletClient;
            readonly manager:
            Address;
        },
    ) { }

    async completeCommitment(input: {
        readonly commitment:
        VerifiableCommitment;
        readonly rewardAssets:
        bigint;
    }): Promise<void> {
        if (input.rewardAssets <= 0n) {
            throw new Error(
                "Commitment reward must be positive",
            );
        }

        const account =
            this.dependencies.walletClient
                .account;

        if (!account) {
            throw new Error(
                "Verifier wallet has no account",
            );
        }

        const commitmentId =
            requireOnchainCommitmentId(
                input.commitment,
            );

        const current =
            await readOnchainCommitment(
                this.dependencies.publicClient,
                this.dependencies.manager,
                commitmentId,
            );

        const currentReward =
            current[5];

        const currentStatus =
            current[6];

        if (currentStatus === 2) {
            if (
                currentReward
                !== input.rewardAssets
            ) {
                throw new Error(
                    `Commitment is already completed with a different reward: ${input.commitment.id}`,
                );
            }

            return;
        }

        if (currentStatus !== 1) {
            throw new Error(
                `Commitment cannot be completed from onchain status ${currentStatus}: ${input.commitment.id}`,
            );
        }

        try {
            const hash =
                await this.dependencies.walletClient
                    .writeContract({
                        account,
                        address:
                            this.dependencies.manager,
                        abi:
                            commitmentSettlementAbi,
                        functionName:
                            "completeCommitment",
                        args: [
                            commitmentId,
                            input.rewardAssets,
                        ],
                        chain: null,
                    });

            const receipt =
                await this.dependencies.publicClient
                    .waitForTransactionReceipt({
                        hash,
                    });

            if (receipt.status !== "success") {
                throw new Error(
                    `Commitment completion reverted: ${input.commitment.id}`,
                );
            }
        } catch (error) {
            const after =
                await readOnchainCommitment(
                    this.dependencies.publicClient,
                    this.dependencies.manager,
                    commitmentId,
                );

            if (
                after[6] === 2
                && after[5]
                === input.rewardAssets
            ) {
                return;
            }

            throw error;
        }
    }

    async failCommitment(input: {
        readonly commitment:
        VerifiableCommitment;
    }): Promise<void> {
        const account =
            this.dependencies.walletClient
                .account;

        if (!account) {
            throw new Error(
                "Verifier wallet has no account",
            );
        }

        const commitmentId =
            requireOnchainCommitmentId(
                input.commitment,
            );

        const current =
            await readOnchainCommitment(
                this.dependencies.publicClient,
                this.dependencies.manager,
                commitmentId,
            );

        const currentStatus =
            current[6];

        if (currentStatus === 3) {
            return;
        }

        if (currentStatus !== 1) {
            throw new Error(
                `Commitment cannot be failed from onchain status ${currentStatus}: ${input.commitment.id}`,
            );
        }

        try {
            const hash =
                await this.dependencies.walletClient
                    .writeContract({
                        account,
                        address:
                            this.dependencies.manager,
                        abi:
                            commitmentSettlementAbi,
                        functionName:
                            "failCommitment",
                        args: [commitmentId],
                        chain: null,
                    });

            const receipt =
                await this.dependencies.publicClient
                    .waitForTransactionReceipt({
                        hash,
                    });

            if (receipt.status !== "success") {
                throw new Error(
                    `Commitment failure settlement reverted: ${input.commitment.id}`,
                );
            }
        } catch (error) {
            const after =
                await readOnchainCommitment(
                    this.dependencies.publicClient,
                    this.dependencies.manager,
                    commitmentId,
                );

            if (after[6] === 3) {
                return;
            }

            throw error;
        }
    }
}