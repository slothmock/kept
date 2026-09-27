import {
    describe,
    expect,
    it,
    vi,
} from "vitest";

import {
    CommitmentVerificationWorker,
} from "../src/verifier/worker.js";

describe(
    "CommitmentVerificationWorker",
    () => {
        it(
            "verifies each due commitment",
            async () => {
                const verify = vi.fn(
                    async () => undefined,
                );

                const worker =
                    new CommitmentVerificationWorker({
                        repository: {
                            listDueActiveCommitments:
                                async () => [
                                    { id: "commitment-1" },
                                    { id: "commitment-2" },
                                ] as never,
                        },

                        verifier: {
                            verify,
                        } as never,
                    });

                const result =
                    await worker.runOnce(
                        new Date(
                            "2026-09-27T00:00:00Z",
                        ),
                    );

                expect(verify)
                    .toHaveBeenCalledTimes(2);

                expect(verify)
                    .toHaveBeenNthCalledWith(
                        1,
                        "commitment-1",
                    );

                expect(verify)
                    .toHaveBeenNthCalledWith(
                        2,
                        "commitment-2",
                    );

                expect(result).toEqual({
                    checked: 2,
                    failed: 0,
                });
            },
        );

        it(
            "continues after one verification fails",
            async () => {
                const verify = vi.fn()
                    .mockRejectedValueOnce(
                        new Error("boom"),
                    )
                    .mockResolvedValueOnce(
                        undefined,
                    );

                const worker =
                    new CommitmentVerificationWorker({
                        repository: {
                            listDueActiveCommitments:
                                async () => [
                                    { id: "commitment-1" },
                                    { id: "commitment-2" },
                                ] as never,
                        },

                        verifier: {
                            verify,
                        } as never,
                    });

                const result =
                    await worker.runOnce();

                expect(verify)
                    .toHaveBeenCalledTimes(2);

                expect(result).toEqual({
                    checked: 2,
                    failed: 1,
                });
            },
        );
    },
);