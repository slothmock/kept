import type { Address, Hex } from "viem";

import type { TransactionSender } from "@/wallet/blockchain";
import {
    buildClaimRewardTransaction,
    readCommitmentRewardState,
    type CommitmentRewardState,
} from "./commitment-manager.js";


export type RewardState =
    | {
        readonly kind: "loading";
    }
    | {
        readonly kind: "ready";
        readonly reward:
        CommitmentRewardState;
    }
    | {
        readonly kind: "error";
        readonly message: string;
    };

export interface RewardClaimDependencies {
    readonly manager: Address;
    readonly chainId: number;
    readonly commitmentId: string;
    readonly sender: TransactionSender;
    readonly readContract: Parameters<
        typeof readCommitmentRewardState
    >[0]["readContract"];
    readonly waitForReceipt: (
        transactionHash: Hex,
    ) => Promise<{
        readonly status: "success" | "reverted";
    }>;
}

export type RewardClaimResult =
    | {
        readonly ok: true;
        readonly alreadyClaimed: false;
        readonly transactionHash: Hex;
        readonly reward: CommitmentRewardState;
    }
    | {
        readonly ok: true;
        readonly alreadyClaimed: true;
        readonly reward: CommitmentRewardState;
    }
    | {
        readonly ok: false;
        readonly error: unknown;
    };



export async function claimCommitmentReward(
    dependencies: RewardClaimDependencies,
): Promise<RewardClaimResult> {
    try {
        const before =
            await readCommitmentRewardState({
                manager: dependencies.manager,
                commitmentId:
                    dependencies.commitmentId,
                readContract:
                    dependencies.readContract,
            });

        if (before.status !== 2) {
            throw new Error(
                "Commitment is not completed.",
            );
        }

        if (before.rewardAssets <= 0n) {
            throw new Error(
                "Commitment has no reward available.",
            );
        }

        if (before.rewardClaimed) {
            return {
                ok: true,
                alreadyClaimed: true,
                reward: before,
            };
        }

        const transactionHash =
            await dependencies.sender
                .sendTransaction(
                    buildClaimRewardTransaction({
                        manager: dependencies.manager,
                        chainId: dependencies.chainId,
                        commitmentId:
                            dependencies.commitmentId,
                    }),
                );

        const receipt =
            await dependencies.waitForReceipt(
                transactionHash,
            );

        if (receipt.status !== "success") {
            throw new Error(
                "Reward claim transaction reverted.",
            );
        }

        const after =
            await readCommitmentRewardState({
                manager: dependencies.manager,
                commitmentId:
                    dependencies.commitmentId,
                readContract:
                    dependencies.readContract,
            });

        if (!after.rewardClaimed) {
            throw new Error(
                "Reward claim was not reflected onchain.",
            );
        }

        return {
            ok: true,
            alreadyClaimed: false,
            transactionHash,
            reward: after,
        };
    } catch (error) {
        return {
            ok: false,
            error,
        };
    }
}