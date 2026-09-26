import { KeptRepository } from "../persistence/repository.js";
import type {
    VaultShareBalanceReader,
} from "../vault-shares.js";
import type {
    VaultSavingsActivityReader,
} from "../vault-activity.js";

import type {
    WeeklySavingsEvidence,
    WeeklySavingsEvidenceSource,
} from "./types.js";

interface WeeklySavingsRepository {
    findPrimaryWalletForOwnerOnChain(
        userId: string,
        chainId: bigint,
    ): Promise<{
        readonly address: string;
    } | null>;

    getGoalAllocatedSharesAt(
        userId: string,
        goalId: string,
        at: Date,
    ): Promise<string>;

    listGoalAllocationDeltasForPeriod(
        userId: string,
        goalId: string,
        startAt: Date,
        endAt: Date,
    ): Promise<
        readonly {
            readonly id: string;
            readonly shareDeltaAtomic: string;
            readonly createdAt: Date;
        }[]
    >;
}

function positive(value: bigint): bigint {
    return value > 0n ? value : 0n;
}

function minimum(
    left: bigint,
    right: bigint,
): bigint {
    return left < right
        ? left
        : right;
}

export class PersistenceWeeklySavingsEvidenceSource
    implements WeeklySavingsEvidenceSource {
    constructor(
        private readonly dependencies: {
            readonly repository: WeeklySavingsRepository;

            readonly vaultShares:
            VaultShareBalanceReader;

            readonly vaultActivity:
            VaultSavingsActivityReader;

            readonly chainId: bigint;
        },
    ) { }

    async evaluatePeriod(input: {
        readonly userId: string;
        readonly goalId: string;
        readonly startAt: Date;
        readonly endAt: Date;
    }): Promise<WeeklySavingsEvidence> {
        if (
            input.endAt.getTime()
            <= input.startAt.getTime()
        ) {
            throw new Error(
                "Weekly savings period is invalid",
            );
        }

        const repository = this.dependencies.repository;

        const wallet =
            await repository
                .findPrimaryWalletForOwnerOnChain(
                    input.userId,
                    this.dependencies.chainId,
                );

        if (!wallet) {
            throw new Error(
                "User has no primary wallet for the configured chain",
            );
        }

        const openingShares =
            BigInt(
                await repository
                    .getGoalAllocatedSharesAt(
                        input.userId,
                        input.goalId,
                        input.startAt,
                    ),
            );

        const deltas =
            await repository
                .listGoalAllocationDeltasForPeriod(
                    input.userId,
                    input.goalId,
                    input.startAt,
                    input.endAt,
                );

        let balanceShares =
            openingShares;

        let cursorMilliseconds =
            input.startAt.getTime();

        let weightedShareMilliseconds =
            0n;

        for (const delta of deltas) {
            const deltaMilliseconds =
                delta.createdAt.getTime();

            if (
                deltaMilliseconds
                < cursorMilliseconds
                || deltaMilliseconds
                > input.endAt.getTime()
            ) {
                throw new Error(
                    "Goal allocation history is outside the verification period",
                );
            }

            const duration =
                BigInt(
                    deltaMilliseconds
                    - cursorMilliseconds,
                );

            weightedShareMilliseconds +=
                balanceShares * duration;

            balanceShares +=
                BigInt(
                    delta.shareDeltaAtomic,
                );

            if (balanceShares < 0n) {
                throw new Error(
                    "Goal allocation history produced a negative balance",
                );
            }

            cursorMilliseconds =
                deltaMilliseconds;
        }

        const remainingDuration =
            BigInt(
                input.endAt.getTime()
                - cursorMilliseconds,
            );

        weightedShareMilliseconds +=
            balanceShares
            * remainingDuration;

        const totalDuration =
            BigInt(
                input.endAt.getTime()
                - input.startAt.getTime(),
            );

        const averageShares =
            weightedShareMilliseconds
            / totalDuration;

        const closingShares =
            balanceShares;

        const allocationIncreaseShares =
            closingShares
            - openingShares;

        const positiveAllocationIncreaseShares =
            positive(
                allocationIncreaseShares,
            );

        const [
            allocationIncreaseAssets,
            averageEligibleBalanceAtomic,
            vaultActivity,
        ] = await Promise.all([
            this.dependencies.vaultShares
                .convertToAssets(
                    positiveAllocationIncreaseShares,
                ),

            this.dependencies.vaultShares
                .convertToAssets(
                    averageShares,
                ),

            this.dependencies.vaultActivity
                .readActivity({
                    account: wallet.address,
                    startAt: input.startAt,
                    endAt: input.endAt,
                }),
        ]);

        const accountNetSavings =
            positive(
                vaultActivity.netAssets,
            );

        const netSavedAtomic =
            minimum(
                accountNetSavings,
                allocationIncreaseAssets,
            );

        return {
            netSavedAtomic,
            averageEligibleBalanceAtomic,
        };
    }
}