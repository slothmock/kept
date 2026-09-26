import {
    describe,
    expect,
    it,
    vi,
} from "vitest";

import type {
    CommitmentDto,
    GoalDto,
} from "../src/api/kept-api.js";

import {
    runGoalDeletion,
    type GoalDeletionStage,
    type OnchainCommitmentStatus,
} from "../src/features/goals/delete-goal-flow.js";

const goal: GoalDto = {
    id: "goal-1",
    userId: "user-1",
    name: "Laptop",
    targetAmountAtomic: "1000000000",
    targetAsset: "USDC",
    targetDate: null,
    status: "ACTIVE",
    createdAt: "2026-09-18T00:00:00.000Z",
    updatedAt: "2026-09-18T00:00:00.000Z",
};

function commitment(
    overrides: Partial<CommitmentDto> = {},
): CommitmentDto {
    return {
        id: "commitment-1",
        userId: "user-1",
        savingsGoalId: goal.id,
        definition: {
            code: "WEEKLY_SAVINGS_V1",
            version: 1,
        },
        parameters: {
            targetAmountAtomic: "25000000",
            periodDays: 7,
        },
        epochStart:
            "2026-09-20T00:00:00.000Z",
        epochEnd:
            "2026-09-27T00:00:00.000Z",
        verificationDeadline:
            "2026-09-28T00:00:00.000Z",
        state: "ACTIVE",
        stateVersion: 2,
        onchainCommitmentId: "7",
        activatedAt:
            "2026-09-20T00:00:00.000Z",
        finalizedAt: null,
        createdAt:
            "2026-09-20T00:00:00.000Z",
        updatedAt:
            "2026-09-20T00:00:00.000Z",
        ...overrides,
    };
}

function dependencies(
    commitments: readonly CommitmentDto[] = [],
) {
    return {
        commitments,
        readOnchainStatus: vi.fn(
            async (
                _commitment: CommitmentDto,
            ): Promise<OnchainCommitmentStatus> =>
                "ACTIVE",
        ),
        cancelOnchain: vi.fn(
            async (_commitment: CommitmentDto) => { },
        ),
        persistCancellation: vi.fn(
            async (_commitment: CommitmentDto) => { },
        ),
        archiveGoal: vi.fn(
            async (_goal: GoalDto) => { },
        ),
        refresh: vi.fn(async () => { }),
        onStage: vi.fn(
            (_stage: GoalDeletionStage) => { },
        ),
    };
}

describe("runGoalDeletion", () => {
    it("archives directly when the goal has no active commitment", async () => {
        const deps = dependencies();

        await runGoalDeletion(
            goal,
            deps,
        );

        expect(
            deps.cancelOnchain,
        ).not.toHaveBeenCalled();

        expect(
            deps.persistCancellation,
        ).not.toHaveBeenCalled();

        expect(
            deps.archiveGoal,
        ).toHaveBeenCalledWith(goal);

        expect(
            deps.refresh,
        ).toHaveBeenCalledTimes(1);

        expect(
            deps.onStage,
        ).toHaveBeenCalledWith("archiving");
    });

    it("ignores draft commitments because the archive service cancels them atomically", async () => {
        const draft = commitment({
            state: "DRAFT",
            stateVersion: 1,
            onchainCommitmentId: null,
            activatedAt: null,
        });

        const deps = dependencies([
            draft,
        ]);

        await runGoalDeletion(
            goal,
            deps,
        );

        expect(
            deps.cancelOnchain,
        ).not.toHaveBeenCalled();

        expect(
            deps.persistCancellation,
        ).not.toHaveBeenCalled();

        expect(
            deps.archiveGoal,
        ).toHaveBeenCalledWith(goal);
    });

    it("cancels an active commitment before archiving", async () => {
        const active = commitment();

        const deps = dependencies([
            active,
        ]);

        await runGoalDeletion(
            goal,
            deps,
        );

        expect(
            deps.cancelOnchain,
        ).toHaveBeenCalledWith(active);

        expect(
            deps.persistCancellation,
        ).toHaveBeenCalledWith(active);

        expect(
            deps.archiveGoal,
        ).toHaveBeenCalledWith(goal);

        expect(
            deps.refresh,
        ).toHaveBeenCalledTimes(1);

        expect(
            deps.onStage.mock.calls.map(
                ([stage]) => stage,
            ),
        ).toEqual([
            "cancelling",
            "confirming",
            "archiving",
        ]);
    });

    it("cancels multiple active commitments sequentially before archiving", async () => {
        const first = commitment({
            id: "commitment-1",
            onchainCommitmentId: "7",
        });

        const second = commitment({
            id: "commitment-2",
            onchainCommitmentId: "8",
        });

        const events: string[] = [];

        const deps = dependencies([
            first,
            second,
        ]);

        deps.cancelOnchain.mockImplementation(
            async (item) => {
                events.push(
                    `chain:${item.id}`,
                );
            },
        );

        deps.persistCancellation.mockImplementation(
            async (item) => {
                events.push(
                    `api:${item.id}`,
                );
            },
        );

        deps.archiveGoal.mockImplementation(
            async () => {
                events.push("archive");
            },
        );

        await runGoalDeletion(
            goal,
            deps,
        );

        expect(events).toEqual([
            "chain:commitment-1",
            "api:commitment-1",
            "chain:commitment-2",
            "api:commitment-2",
            "archive",
        ]);
    });

    it("does not resend cancellation when the commitment is already cancelled on-chain", async () => {
        const active = commitment();

        const deps = dependencies([
            active,
        ]);

        deps.readOnchainStatus.mockResolvedValue(
            "CANCELLED",
        );

        await runGoalDeletion(
            goal,
            deps,
        );

        expect(
            deps.cancelOnchain,
        ).not.toHaveBeenCalled();

        expect(
            deps.persistCancellation,
        ).toHaveBeenCalledWith(active);

        expect(
            deps.archiveGoal,
        ).toHaveBeenCalledWith(goal);
    });

    it("does not archive when on-chain cancellation fails", async () => {
        const active = commitment();

        const deps = dependencies([
            active,
        ]);

        deps.cancelOnchain.mockRejectedValue(
            new Error(
                "Transaction reverted",
            ),
        );

        await expect(
            runGoalDeletion(
                goal,
                deps,
            ),
        ).rejects.toThrow(
            "Transaction reverted",
        );

        expect(
            deps.persistCancellation,
        ).not.toHaveBeenCalled();

        expect(
            deps.archiveGoal,
        ).not.toHaveBeenCalled();

        expect(
            deps.refresh,
        ).not.toHaveBeenCalled();
    });

    it("does not archive when cancellation cannot be persisted", async () => {
        const active = commitment();

        const deps = dependencies([
            active,
        ]);

        deps.persistCancellation.mockRejectedValue(
            new Error(
                "API unavailable",
            ),
        );

        await expect(
            runGoalDeletion(
                goal,
                deps,
            ),
        ).rejects.toThrow(
            "API unavailable",
        );

        expect(
            deps.cancelOnchain,
        ).toHaveBeenCalledTimes(1);

        expect(
            deps.archiveGoal,
        ).not.toHaveBeenCalled();

        expect(
            deps.refresh,
        ).not.toHaveBeenCalled();
    });

    it("does not refresh when archiving fails", async () => {
        const deps = dependencies();

        deps.archiveGoal.mockRejectedValue(
            new Error(
                "Archive failed",
            ),
        );

        await expect(
            runGoalDeletion(
                goal,
                deps,
            ),
        ).rejects.toThrow(
            "Archive failed",
        );

        expect(
            deps.refresh,
        ).not.toHaveBeenCalled();
    });

    it("rejects an active commitment without an on-chain reference", async () => {
        const active = commitment({
            onchainCommitmentId: null,
        });

        const deps = dependencies([
            active,
        ]);

        await expect(
            runGoalDeletion(
                goal,
                deps,
            ),
        ).rejects.toThrow(
            "Active commitment is missing its on-chain reference.",
        );

        expect(
            deps.cancelOnchain,
        ).not.toHaveBeenCalled();

        expect(
            deps.archiveGoal,
        ).not.toHaveBeenCalled();
    });

    it("ignores commitments belonging to another goal", async () => {
        const other = commitment({
            savingsGoalId: "goal-2",
        });

        const deps = dependencies([
            other,
        ]);

        await runGoalDeletion(
            goal,
            deps,
        );

        expect(
            deps.cancelOnchain,
        ).not.toHaveBeenCalled();

        expect(
            deps.archiveGoal,
        ).toHaveBeenCalledWith(goal);
    });
});