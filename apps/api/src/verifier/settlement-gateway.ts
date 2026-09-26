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
    }
}