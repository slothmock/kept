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
  commitmentManagerAbi,
  confirmCommitmentCreation,
  referenceIdForCommitment,
} from "../src/commitments/commitment-manager.js";

const manager = getAddress("0x1111111111111111111111111111111111111111");
const owner = getAddress("0x2222222222222222222222222222222222222222");
const hash = `0x${"a".repeat(64)}` as Hex;
const referenceId = "0x27df9e4f396b049a38fecd6237c650c5df3f372785585cd7ced3fae81d61e5cd" as Hex;

function createdLog(commitmentId = 7n) {
  return {
    address: manager,
    topics: encodeEventTopics({
      abi: commitmentManagerAbi,
      eventName: "CommitmentCreated",
      args: { commitmentId, owner, referenceId },
    }),
    data: encodeAbiParameters(
      [{ type: "uint64" }, { type: "uint64" }],
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
});
