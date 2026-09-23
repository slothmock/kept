import { describe, expect, it, vi } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  getAddress,
  type Hex,
} from "viem";

import {
  CommitmentSettlementMismatchError,
  createCommitmentSettlementVerifier,
  decodeOnchainCommitmentId,
  encodeOnchainCommitmentId,
  referenceIdForCommitment,
} from "../src/commitment-settlement.js";

const manager = getAddress("0x1111111111111111111111111111111111111111");
const owner = getAddress("0x2222222222222222222222222222222222222222");
const offchainId = "00000000-0000-4000-8000-000000000001";
const referenceId = "0x27df9e4f396b049a38fecd6237c650c5df3f372785585cd7ced3fae81d61e5cd";
const transactionHash = `0x${"a".repeat(64)}` as Hex;
const createAbi = [{
  type: "function",
  name: "createCommitment",
  stateMutability: "nonpayable",
  inputs: [
    { name: "referenceId", type: "bytes32" },
    { name: "startAt", type: "uint64" },
    { name: "endAt", type: "uint64" },
  ],
  outputs: [{ name: "commitmentId", type: "uint256" }],
}] as const;
const createdEventAbi = [{
  type: "event",
  name: "CommitmentCreated",
  inputs: [
    { name: "commitmentId", type: "uint256", indexed: true },
    { name: "owner", type: "address", indexed: true },
    { name: "referenceId", type: "bytes32", indexed: true },
    { name: "startAt", type: "uint64", indexed: false },
    { name: "endAt", type: "uint64", indexed: false },
  ],
}] as const;

function reader(record: readonly unknown[]) {
  return {
    getChainId: vi.fn().mockResolvedValue(143),
    getTransaction: vi.fn().mockResolvedValue({
      from: owner,
      to: manager,
      input: encodeFunctionData({
        abi: createAbi,
        functionName: "createCommitment",
        args: [referenceId, 2_000n, 3_000n],
      }),
    }),
    getTransactionReceipt: vi.fn().mockResolvedValue({
      status: "success",
      blockNumber: 99n,
      logs: [{
        address: manager,
        topics: encodeEventTopics({
          abi: createdEventAbi,
          eventName: "CommitmentCreated",
          args: { commitmentId: 7n, owner, referenceId },
        }),
        data: encodeAbiParameters(
          [{ type: "uint64" }, { type: "uint64" }],
          [2_000n, 3_000n],
        ),
      }],
    }),
    getBlockNumber: vi.fn().mockResolvedValue(100n),
    readContract: vi.fn().mockResolvedValue(record),
  };
}

describe("server-authoritative commitment settlement verification", () => {
  it("derives and round-trips the opaque settlement reference", () => {
    expect(referenceIdForCommitment(offchainId)).toBe(referenceId);
    expect(decodeOnchainCommitmentId(encodeOnchainCommitmentId("7"))).toBe("7");
  });

  it("accepts only the configured chain and exact active onchain record", async () => {
    const publicClient = reader([
      owner,
      referenceId,
      1_900n,
      2_000n,
      3_000n,
      0n,
      1,
      false,
    ]);
    const verifier = createCommitmentSettlementVerifier({
      publicClient,
      manager,
      chainId: 143,
    });

    await expect(verifier.verifyActive({
      offchainCommitmentId: offchainId,
      onchainCommitmentId: "7",
      transactionHash,
      startAt: new Date("1970-01-01T00:33:20.000Z"),
      endAt: new Date("1970-01-01T00:50:00.000Z"),
    })).resolves.toMatchObject({
      settlementRef: encodeOnchainCommitmentId("7"),
      owner,
      chainId: 143,
    });
    expect(publicClient.readContract).toHaveBeenCalledWith(expect.objectContaining({
      address: manager,
      functionName: "commitments",
      args: [7n],
    }));
  });

  it("requires a successful creation receipt with two confirmations", async () => {
    const publicClient = reader([
      owner, referenceId, 1_900n, 2_000n, 3_000n, 0n, 1, false,
    ]);
    publicClient.getBlockNumber.mockResolvedValue(99n);
    const verifier = createCommitmentSettlementVerifier({
      publicClient,
      manager,
      chainId: 143,
    });

    await expect(verifier.verifyActive({
      offchainCommitmentId: offchainId,
      onchainCommitmentId: "7",
      transactionHash,
      startAt: new Date("1970-01-01T00:33:20.000Z"),
      endAt: new Date("1970-01-01T00:50:00.000Z"),
    })).rejects.toBeInstanceOf(CommitmentSettlementMismatchError);
  });

  it("rejects owner, reference, timing, status, and chain mismatches", async () => {
    const valid = [owner, referenceId, 1_900n, 2_000n, 3_000n, 0n, 1, false] as const;
    for (const record of [
      [getAddress("0x3333333333333333333333333333333333333333"), ...valid.slice(1)],
      [valid[0], `0x${"f".repeat(64)}`, ...valid.slice(2)],
      [...valid.slice(0, 4), 3_001n, ...valid.slice(5)],
      [...valid.slice(0, 6), 0, valid[7]],
    ]) {
      const verifier = createCommitmentSettlementVerifier({ publicClient: reader(record), manager, chainId: 143 });
      await expect(verifier.verifyActive({
        offchainCommitmentId: offchainId,
        onchainCommitmentId: "7",
        transactionHash,
        startAt: new Date("1970-01-01T00:33:20.000Z"),
        endAt: new Date("1970-01-01T00:50:00.000Z"),
      })).rejects.toBeInstanceOf(CommitmentSettlementMismatchError);
    }

    const wrongChain = reader(valid);
    wrongChain.getChainId.mockResolvedValue(1);
    const verifier = createCommitmentSettlementVerifier({ publicClient: wrongChain, manager, chainId: 143 });
    await expect(verifier.verifyActive({
      offchainCommitmentId: offchainId,
      onchainCommitmentId: "7",
      transactionHash,
      startAt: new Date("1970-01-01T00:33:20.000Z"),
      endAt: new Date("1970-01-01T00:50:00.000Z"),
    })).rejects.toBeInstanceOf(CommitmentSettlementMismatchError);
  });

  it("requires contract cancellation before API cancellation", async () => {
    const input = {
      offchainCommitmentId: offchainId,
      onchainCommitmentId: "7",
      owner,
      startAt: new Date("1970-01-01T00:33:20.000Z"),
      endAt: new Date("1970-01-01T00:50:00.000Z"),
    };
    const active = createCommitmentSettlementVerifier({
      publicClient: reader([owner, referenceId, 1_900n, 2_000n, 3_000n, 0n, 1, false]),
      manager,
      chainId: 143,
    });
    await expect(active.verifyCancelled(input)).rejects.toBeInstanceOf(
      CommitmentSettlementMismatchError,
    );

    const cancelled = createCommitmentSettlementVerifier({
      publicClient: reader([owner, referenceId, 1_900n, 2_000n, 3_000n, 0n, 4, false]),
      manager,
      chainId: 143,
    });
    await expect(cancelled.verifyCancelled(input)).resolves.toMatchObject({
      settlementRef: encodeOnchainCommitmentId("7"),
    });
  });
});
