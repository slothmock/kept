import type { KeptRepository } from "../persistence/repository.js";
import type { CommitmentVerifier } from "./service.js";

export interface CommitmentVerificationWorkerOptions {
    readonly repository: Pick<
        KeptRepository,
        "listDueActiveCommitments"
    >;

    readonly verifier: Pick<
        CommitmentVerifier,
        "verify"
    >;

    readonly batchSize?: number;
}

export class CommitmentVerificationWorker {
    private readonly batchSize: number;

    constructor(
        private readonly options:
            CommitmentVerificationWorkerOptions,
    ) {
        this.batchSize =
            options.batchSize ?? 50;

        if (
            !Number.isSafeInteger(this.batchSize)
            || this.batchSize <= 0
        ) {
            throw new Error(
                "batchSize must be a positive safe integer",
            );
        }
    }

    async runOnce(
        now = new Date(),
    ): Promise<{
        readonly checked: number;
        readonly failed: number;
    }> {
        const commitments =
            await this.options.repository
                .listDueActiveCommitments(
                    now,
                    this.batchSize,
                );

        let failed = 0;

        for (const commitment of commitments) {
            try {
                await this.options.verifier.verify(commitment.id);
            } catch (error) {
                failed += 1;

                console.error(
                    "Commitment verification failed",
                    {
                        commitmentId:
                            commitment.id,
                        error,
                    },
                );
            }
        }

        return {
            checked: commitments.length,
            failed,
        };
    }
}