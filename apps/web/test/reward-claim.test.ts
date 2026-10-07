import { describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";

import { claimCommitmentReward } from "../src/features/commitments/reward-claim.js";

const manager =
    "0x1111111111111111111111111111111111111111" as Address;

const owner =
    "0x2222222222222222222222222222222222222222" as Address;

const transactionHash =
    `0x${"ab".repeat(32)}` as Hex;

function claimedReward() {
    return {
        owner,
        rewardAssets: 5_000_000n,
        rewardClaimed: true,
        status: 2,
    };
}

describe("claimCommitmentReward", () => {
    it("claims a completed unclaimed reward", async () => {
        const readContract = vi
            .fn()
            .mockResolvedValueOnce([
                owner,
                `0x${"11".repeat(32)}`,
                1n,
                2n,
                3n,
                5_000_000n,
                2,
                false,
            ])
            .mockResolvedValueOnce([
                owner,
                `0x${"11".repeat(32)}`,
                1n,
                2n,
                3n,
                5_000_000n,
                2,
                true,
            ]);

        const sender = {
            sendTransaction: vi
                .fn()
                .mockResolvedValue(transactionHash),
        };

        const waitForReceipt = vi
            .fn()
            .mockResolvedValue({
                status: "success" as const,
            });

        const result =
            await claimCommitmentReward({
                manager,
                chainId: 143,
                commitmentId: "1",
                sender,
                readContract,
                waitForReceipt,
            });

        expect(result).toEqual({
            ok: true,
            alreadyClaimed: false,
            transactionHash,
            reward: claimedReward(),
        });

        expect(
            sender.sendTransaction,
        ).toHaveBeenCalledOnce();

        expect(
            waitForReceipt,
        ).toHaveBeenCalledWith(
            transactionHash,
        );

        expect(readContract).toHaveBeenCalledTimes(2);
    });

    it("returns success without sending when reward is already claimed", async () => {
        const readContract = vi
            .fn()
            .mockResolvedValue([
                owner,
                `0x${"11".repeat(32)}`,
                1n,
                2n,
                3n,
                5_000_000n,
                2,
                true,
            ]);

        const sender = {
            sendTransaction: vi.fn(),
        };

        const waitForReceipt = vi.fn();

        const result =
            await claimCommitmentReward({
                manager,
                chainId: 143,
                commitmentId: "1",
                sender,
                readContract,
                waitForReceipt,
            });

        expect(result).toEqual({
            ok: true,
            alreadyClaimed: true,
            reward: claimedReward(),
        });

        expect(
            sender.sendTransaction,
        ).not.toHaveBeenCalled();

        expect(
            waitForReceipt,
        ).not.toHaveBeenCalled();

        expect(readContract).toHaveBeenCalledOnce();
    });

    it("fails when the commitment is not completed", async () => {
        const readContract = vi
            .fn()
            .mockResolvedValue([
                owner,
                `0x${"11".repeat(32)}`,
                1n,
                2n,
                3n,
                5_000_000n,
                1,
                false,
            ]);

        const sender = {
            sendTransaction: vi.fn(),
        };

        const waitForReceipt = vi.fn();

        const result =
            await claimCommitmentReward({
                manager,
                chainId: 143,
                commitmentId: "1",
                sender,
                readContract,
                waitForReceipt,
            });

        expect(result.ok).toBe(false);

        if (result.ok) {
            throw new Error(
                "Expected reward claim to fail",
            );
        }

        expect(result.error).toBeInstanceOf(Error);

        expect(
            (result.error as Error).message,
        ).toBe(
            "Commitment is not completed.",
        );

        expect(
            sender.sendTransaction,
        ).not.toHaveBeenCalled();

        expect(
            waitForReceipt,
        ).not.toHaveBeenCalled();
    });

    it("fails when no reward is available", async () => {
        const readContract = vi
            .fn()
            .mockResolvedValue([
                owner,
                `0x${"11".repeat(32)}`,
                1n,
                2n,
                3n,
                0n,
                2,
                false,
            ]);

        const sender = {
            sendTransaction: vi.fn(),
        };

        const waitForReceipt = vi.fn();

        const result =
            await claimCommitmentReward({
                manager,
                chainId: 143,
                commitmentId: "1",
                sender,
                readContract,
                waitForReceipt,
            });

        expect(result.ok).toBe(false);

        if (result.ok) {
            throw new Error(
                "Expected reward claim to fail",
            );
        }

        expect(
            (result.error as Error).message,
        ).toBe(
            "Commitment has no reward available.",
        );

        expect(
            sender.sendTransaction,
        ).not.toHaveBeenCalled();
    });

    it("fails when the claim transaction reverts", async () => {
        const readContract = vi
            .fn()
            .mockResolvedValue([
                owner,
                `0x${"11".repeat(32)}`,
                1n,
                2n,
                3n,
                5_000_000n,
                2,
                false,
            ]);

        const sender = {
            sendTransaction: vi
                .fn()
                .mockResolvedValue(transactionHash),
        };

        const waitForReceipt = vi
            .fn()
            .mockResolvedValue({
                status: "reverted" as const,
            });

        const result =
            await claimCommitmentReward({
                manager,
                chainId: 143,
                commitmentId: "1",
                sender,
                readContract,
                waitForReceipt,
            });

        expect(result.ok).toBe(false);

        if (result.ok) {
            throw new Error(
                "Expected reward claim to fail",
            );
        }

        expect(
            (result.error as Error).message,
        ).toBe(
            "Reward claim transaction reverted.",
        );

        expect(readContract).toHaveBeenCalledOnce();
    });

    it("fails when confirmed state is still unclaimed", async () => {
        const readContract = vi
            .fn()
            .mockResolvedValue([
                owner,
                `0x${"11".repeat(32)}`,
                1n,
                2n,
                3n,
                5_000_000n,
                2,
                false,
            ]);

        const sender = {
            sendTransaction: vi
                .fn()
                .mockResolvedValue(transactionHash),
        };

        const waitForReceipt = vi
            .fn()
            .mockResolvedValue({
                status: "success" as const,
            });

        const result =
            await claimCommitmentReward({
                manager,
                chainId: 143,
                commitmentId: "1",
                sender,
                readContract,
                waitForReceipt,
            });

        expect(result.ok).toBe(false);

        if (result.ok) {
            throw new Error(
                "Expected reward claim to fail",
            );
        }

        expect(
            (result.error as Error).message,
        ).toBe(
            "Reward claim was not reflected onchain.",
        );

        expect(readContract).toHaveBeenCalledTimes(2);
    });

    it("returns failures from the wallet sender", async () => {
        const readContract = vi
            .fn()
            .mockResolvedValue([
                owner,
                `0x${"11".repeat(32)}`,
                1n,
                2n,
                3n,
                5_000_000n,
                2,
                false,
            ]);

        const walletError =
            new Error("User rejected");

        const sender = {
            sendTransaction: vi
                .fn()
                .mockRejectedValue(walletError),
        };

        const result =
            await claimCommitmentReward({
                manager,
                chainId: 143,
                commitmentId: "1",
                sender,
                readContract,
                waitForReceipt: vi.fn(),
            });

        expect(result).toEqual({
            ok: false,
            error: walletError,
        });
    });
});