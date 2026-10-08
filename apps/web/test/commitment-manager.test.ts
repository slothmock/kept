import { describe, expect, it, vi } from "vitest";
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  type Hex,
} from "viem";

import {
  buildCreateCommitmentTransaction,
  buildCancelCommitmentTransaction,
  buildClaimRewardTransaction,
  readCommitmentRewardState,
  commitmentManagerAbi,
  confirmCommitmentCreation,
  referenceIdForCommitment,
} from "../src/features/commitments/commitment-manager.js";

const manager = getAddress("0x1111111111111111111111111111111111111111");
const owner = getAddress("0x2222222222222222222222222222222222222222");
const hash = `0x${"a".repeat(64)}` as Hex;
const referenceId = "0x27df9e4f396b049a38fecd6237c650c5df3f372785585cd7ced3fae81d61e5cd" as Hex;

function createdLog(commitmentId = 7n) {
  const topics = encodeEventTopics({
    abi: commitmentManagerAbi,
    eventName: "CommitmentCreated",
    args: {
      commitmentId,
      owner,
      referenceId,
    },
  }) as readonly Hex[];

  return {
    address: manager,
    topics,
    data: encodeAbiParameters(
      [
        { type: "uint64" },
        { type: "uint64" },
      ],
      [2_000n, 3_000n],
    ),
  };
}

describe("CommitmentManager browser integration", () => {
  it("derives the opaque reference deterministically and encodes the exact create call", () => {
    expect(referenceIdForCommitment("00000000-0000-4000-8000-000000000001")).toBe(referenceId);

    const transaction = buildCreateCommitmentTransaction({
      manager,
      chainId: 143,
      referenceId,
      startAt: 2_000n,
      endAt: 3_000n,
    });
    expect(transaction).toMatchObject({ to: manager, chainId: 143 });
    expect(transaction.data.slice(0, 10)).toBe("0xde538aea");
    expect(decodeFunctionData({ abi: commitmentManagerAbi, data: transaction.data })).toEqual({
      functionName: "createCommitment",
      args: [referenceId, 2_000n, 3_000n],
    });
  });

  it("accepts only a confirmed event and matching settled contract state", async () => {
    const readContract = vi.fn().mockResolvedValue([
      owner,
      referenceId,
      1_900n,
      2_000n,
      3_000n,
      0n,
      1,
      false,
    ]);

    await expect(confirmCommitmentCreation({
      manager,
      owner,
      referenceId,
      startAt: 2_000n,
      endAt: 3_000n,
      transactionHash: hash,
      receipt: { status: "success", logs: [createdLog()] },
      readContract,
    })).resolves.toEqual({
      commitmentId: 7n,
      referenceId,
      owner,
      transactionHash: hash,
    });
    expect(readContract).toHaveBeenCalledWith(expect.objectContaining({
      address: manager,
      functionName: "commitments",
      args: [7n],
    }));
  });

  it("fails closed when the event or settled state does not match the API draft", async () => {
    await expect(confirmCommitmentCreation({
      manager,
      owner,
      referenceId,
      startAt: 2_000n,
      endAt: 3_000n,
      transactionHash: hash,
      receipt: { status: "success", logs: [createdLog()] },
      readContract: vi.fn().mockResolvedValue([
        owner,
        referenceId,
        1_900n,
        2_000n,
        3_001n,
        0n,
        1,
        false,
      ]),
    })).rejects.toThrow("settled commitment state did not match");

    await expect(confirmCommitmentCreation({
      manager,
      owner,
      referenceId,
      startAt: 2_000n,
      endAt: 3_000n,
      transactionHash: hash,
      receipt: { status: "success", logs: [] },
      readContract: vi.fn(),
    })).rejects.toThrow("creation event was not found");
  });

  it("encodes the exact cancel call", () => {
    const transaction =
      buildCancelCommitmentTransaction({
        manager,
        chainId: 143,
        commitmentId: "7",
      });

    expect(transaction).toMatchObject({
      to: manager,
      chainId: 143,
    });

    expect(
      decodeFunctionData({
        abi: commitmentManagerAbi,
        data: transaction.data,
      }),
    ).toEqual({
      functionName: "cancelCommitment",
      args: [7n],
    });
  });

  it.each([
    "",
    "-1",
    "1.5",
    "abc",
  ])(
    "rejects invalid onchain commitment id %j",
    (commitmentId) => {
      expect(() =>
        buildCancelCommitmentTransaction({
          manager,
          chainId: 143,
          commitmentId,
        }),
      ).toThrow();
    },
  );

  it("rejects commitment id zero", () => {
    expect(() =>
      buildCancelCommitmentTransaction({
        manager,
        chainId: 143,
        commitmentId: "0",
      }),
    ).toThrow(
      "Onchain commitment ID is outside uint256 range.",
    );
  });

  it("rejects commitment ids above uint256", () => {
    expect(() =>
      buildCancelCommitmentTransaction({
        manager,
        chainId: 143,
        commitmentId:
          (1n << 256n).toString(),
      }),
    ).toThrow(
      "Onchain commitment ID is outside uint256 range.",
    );
  });
});

describe("reward claiming", () => {
  const referenceId =
    `0x${"ab".repeat(32)}` as Hex;

  it("builds a claimReward transaction", () => {
    const transaction =
      buildClaimRewardTransaction({
        manager,
        chainId: 143,
        commitmentId: "42",
      });

    expect(transaction.to).toBe(manager);
    expect(transaction.chainId).toBe(143);

    const decoded = decodeFunctionData({
      abi: commitmentManagerAbi,
      data: transaction.data,
    });

    expect(decoded.functionName).toBe(
      "claimReward",
    );

    expect(decoded.args).toEqual([42n]);
  });

  it("reads a completed unclaimed reward", async () => {
    const readContract = vi.fn(
      async () =>
        [
          owner,
          referenceId,
          1n,
          2n,
          3n,
          5_000_000n,
          2,
          false,
        ] as const,
    );

    const reward =
      await readCommitmentRewardState({
        manager,
        commitmentId: "1",
        readContract,
      });

    expect(reward).toEqual({
      owner,
      rewardAssets: 5_000_000n,
      status: 2,
      rewardClaimed: false,
    });

    expect(readContract).toHaveBeenCalledOnce();
  });

  it("reads an already claimed reward", async () => {
    const readContract = vi.fn(
      async () =>
        [
          owner,
          referenceId,
          1n,
          2n,
          3n,
          5_000_000n,
          2,
          true,
        ] as const,
    );

    const reward =
      await readCommitmentRewardState({
        manager,
        commitmentId: "1",
        readContract,
      });

    expect(reward.rewardAssets).toBe(
      5_000_000n,
    );

    expect(reward.status).toBe(2);
    expect(reward.rewardClaimed).toBe(true);
  });

  it.each([
    "",
    "-1",
    "abc",
    "1.5",
  ])(
    "rejects malformed commitment id %p",
    async (commitmentId) => {
      expect(() =>
        buildClaimRewardTransaction({
          manager,
          chainId: 143,
          commitmentId,
        }),
      ).toThrow(
        "Onchain commitment ID must be an unsigned integer.",
      );

      await expect(
        readCommitmentRewardState({
          manager,
          commitmentId,
          readContract: vi.fn(),
        }),
      ).rejects.toThrow(
        "Onchain commitment ID must be an unsigned integer.",
      );
    },
  );

  it("rejects zero commitment id", async () => {
    expect(() =>
      buildClaimRewardTransaction({
        manager,
        chainId: 143,
        commitmentId: "0",
      }),
    ).toThrow(
      "Onchain commitment ID is outside uint256 range.",
    );

    await expect(
      readCommitmentRewardState({
        manager,
        commitmentId: "0",
        readContract: vi.fn(),
      }),
    ).rejects.toThrow(
      "Onchain commitment ID is outside uint256 range.",
    );
  });

  it("rejects commitment ids above uint256", () => {
    const tooLarge =
      (1n << 256n).toString();

    expect(() =>
      buildClaimRewardTransaction({
        manager,
        chainId: 143,
        commitmentId: tooLarge,
      }),
    ).toThrow(
      "Onchain commitment ID is outside uint256 range.",
    );
  });
});
