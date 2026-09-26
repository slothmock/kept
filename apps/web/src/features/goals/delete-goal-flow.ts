import type {
    CommitmentDto,
    GoalDto,
} from "@/api/kept-api";

export type GoalDeletionStage =
    | "cancelling"
    | "confirming"
    | "archiving";

export type OnchainCommitmentStatus =
    | "ACTIVE"
    | "COMPLETED"
    | "FAILED"
    | "CANCELLED";

export interface GoalDeletionDependencies {
    readonly commitments: readonly CommitmentDto[];

    readonly readOnchainStatus: (
        commitment: CommitmentDto,
    ) => Promise<OnchainCommitmentStatus>;

    readonly cancelOnchain: (
        commitment: CommitmentDto,
    ) => Promise<void>;

    readonly persistCancellation: (
        commitment: CommitmentDto,
    ) => Promise<void>;

    readonly archiveGoal: (
        goal: GoalDto,
    ) => Promise<void>;

    readonly refresh: () => Promise<void>;

    readonly onStage?: (
        stage: GoalDeletionStage,
    ) => void;
}

export async function runGoalDeletion(
    goal: GoalDto,
    dependencies: GoalDeletionDependencies,
): Promise<void> {
    const activeCommitments =
        dependencies.commitments.filter(
            (commitment) =>
                commitment.savingsGoalId === goal.id
                && commitment.state === "ACTIVE",
        );

    for (const commitment of activeCommitments) {
        if (!commitment.onchainCommitmentId) {
            throw new Error(
                "Active commitment is missing its on-chain reference.",
            );
        }

        const status =
            await dependencies.readOnchainStatus(
                commitment,
            );

        if (status === "ACTIVE") {
            dependencies.onStage?.("cancelling");

            await dependencies.cancelOnchain(
                commitment,
            );
        } else if (status !== "CANCELLED") {
            throw new Error(
                `Commitment is ${status.toLowerCase()} on-chain and cannot be cancelled.`,
            );
        }

        dependencies.onStage?.("confirming");

        await dependencies.persistCancellation(
            commitment,
        );
    }

    dependencies.onStage?.("archiving");

    await dependencies.archiveGoal(goal);

    await dependencies.refresh();
}