import {
  decodeEventLog,
  encodeFunctionData,
  getAddress,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from "viem";

import type { UnsignedVaultTransaction } from "../vault/transactions.js";

const UINT256_MAX = (1n << 256n) - 1n;

export const commitmentManagerAbi = [
  {
    type: "function",
    name: "createCommitment",
    stateMutability: "nonpayable",
    inputs: [
      { name: "referenceId", type: "bytes32" },
      { name: "startAt", type: "uint64" },
      { name: "endAt", type: "uint64" },
    ],
    outputs: [
      { name: "commitmentId", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "cancelCommitment",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "commitmentId",
        type: "uint256",
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "commitments",
    stateMutability: "view",
    inputs: [
      {
        name: "commitmentId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "owner",
        type: "address",
      },
      {
        name: "referenceId",
        type: "bytes32",
      },
      {
        name: "createdAt",
        type: "uint64",
      },
      {
        name: "startAt",
        type: "uint64",
      },
      {
        name: "endAt",
        type: "uint64",
      },
      {
        name: "rewardAssets",
        type: "uint256",
      },
      {
        name: "status",
        type: "uint8",
      },
      {
        name: "rewardClaimed",
        type: "bool",
      },
    ],
  },
  {
    type: "function",
    name: "claimReward",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "commitmentId",
        type: "uint256",
      },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "CommitmentCreated",
    anonymous: false,
    inputs: [
      {
        name: "commitmentId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "owner",
        type: "address",
        indexed: true,
      },
      {
        name: "referenceId",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "startAt",
        type: "uint64",
        indexed: false,
      },
      {
        name: "endAt",
        type: "uint64",
        indexed: false,
      },
    ],
  },
] as const;

export interface ConfirmedCommitmentCreation {
  readonly commitmentId: bigint;
  readonly referenceId: Hex;
  readonly owner: Address;
  readonly transactionHash: Hex;
}

export class CommitmentConfirmationError extends Error {
  readonly restartable: boolean;

  constructor(
    message: string,
    restartable: boolean,
  ) {
    super(message);
    this.name = "CommitmentConfirmationError";
    this.restartable = restartable;
  }
}

export interface CommitmentRewardState {
  readonly owner: Address;
  readonly rewardAssets: bigint;
  readonly rewardClaimed: boolean;
  readonly status: number;
}

interface ContractReader {
  readContract(input: {
    readonly address: Address;
    readonly abi: typeof commitmentManagerAbi;
    readonly functionName: "commitments";
    readonly args: readonly [bigint];
  }): Promise<unknown>;
}

interface CommitmentReceipt {
  readonly status: "success" | "reverted";
  readonly logs: readonly {
    readonly address: Address;
    readonly data: Hex;
    readonly topics: readonly Hex[];
  }[];
}

export function referenceIdForCommitment(
  commitmentId: string,
): Hex {
  return keccak256(toBytes(commitmentId));
}

function parseCommitmentId(
  value: string,
): bigint {
  if (!/^\d+$/.test(value)) {
    throw new Error(
      "Onchain commitment ID must be an unsigned integer.",
    );
  }

  const commitmentId = BigInt(value);

  if (
    commitmentId < 1n
    || commitmentId > UINT256_MAX
  ) {
    throw new Error(
      "Onchain commitment ID is outside uint256 range.",
    );
  }

  return commitmentId;
}

export function timestampSeconds(
  value: string | Date,
): bigint {
  const milliseconds =
    typeof value === "string"
      ? new Date(value).getTime()
      : value.getTime();

  if (
    !Number.isSafeInteger(milliseconds)
    || milliseconds < 0
    || milliseconds % 1_000 !== 0
  ) {
    throw new Error(
      "Commitment timestamps must use whole seconds.",
    );
  }

  return BigInt(milliseconds / 1_000);
}

export function buildCreateCommitmentTransaction(
  input: {
    readonly manager: Address;
    readonly chainId: number;
    readonly referenceId: Hex;
    readonly startAt: bigint;
    readonly endAt: bigint;
  },
): UnsignedVaultTransaction {
  return {
    to: input.manager,
    chainId: input.chainId,
    data: encodeFunctionData({
      abi: commitmentManagerAbi,
      functionName: "createCommitment",
      args: [
        input.referenceId,
        input.startAt,
        input.endAt,
      ],
    }),
  };
}

export function buildCancelCommitmentTransaction(
  input: {
    readonly manager: Address;
    readonly chainId: number;
    readonly commitmentId: string;
  },
): UnsignedVaultTransaction {
  const commitmentId =
    parseCommitmentId(
      input.commitmentId,
    );

  return {
    to: input.manager,
    chainId: input.chainId,
    data: encodeFunctionData({
      abi: commitmentManagerAbi,
      functionName:
        "cancelCommitment",
      args: [commitmentId],
    }),
  };
}

function normalizeRecord(
  value: unknown,
): readonly [
  Address,
  Hex,
  bigint,
  bigint,
  bigint,
  bigint,
  number,
  boolean,
] {
  if (
    !Array.isArray(value)
    || value.length !== 8
  ) {
    throw new Error(
      "CommitmentManager returned an invalid commitment record.",
    );
  }

  const [
    owner,
    referenceId,
    createdAt,
    startAt,
    endAt,
    rewardAssets,
    status,
    rewardClaimed,
  ] = value;

  if (
    typeof owner !== "string"
    || typeof referenceId !== "string"
    || typeof createdAt !== "bigint"
    || typeof startAt !== "bigint"
    || typeof endAt !== "bigint"
    || typeof rewardAssets !== "bigint"
    || (
      typeof status !== "number"
      && typeof status !== "bigint"
    )
    || typeof rewardClaimed !== "boolean"
  ) {
    throw new Error(
      "CommitmentManager returned an invalid commitment record.",
    );
  }

  const normalizedStatus =
    typeof status === "bigint"
      ? Number(status)
      : status;

  if (
    !Number.isSafeInteger(normalizedStatus)
  ) {
    throw new Error(
      "CommitmentManager returned an invalid commitment status.",
    );
  }

  return [
    getAddress(owner),
    referenceId as Hex,
    createdAt,
    startAt,
    endAt,
    rewardAssets,
    normalizedStatus,
    rewardClaimed,
  ];
}

export async function confirmCommitmentCreation(
  input: {
    readonly manager: Address;
    readonly owner: Address;
    readonly referenceId: Hex;
    readonly startAt: bigint;
    readonly endAt: bigint;
    readonly transactionHash: Hex;
    readonly receipt: CommitmentReceipt;
    readonly readContract:
    ContractReader["readContract"];
  },
): Promise<ConfirmedCommitmentCreation> {
  if (
    input.receipt.status !== "success"
  ) {
    throw new CommitmentConfirmationError(
      "Commitment creation transaction reverted.",
      true,
    );
  }

  let commitmentId: bigint | null = null;

  for (const log of input.receipt.logs) {
    if (
      getAddress(log.address)
      !== input.manager
    ) {
      continue;
    }

    if (log.topics.length === 0) {
      continue;
    }

    try {
      const decoded =
        decodeEventLog({
          abi: commitmentManagerAbi,
          eventName:
            "CommitmentCreated",
          data: log.data,
          topics:
            log.topics as [
              Hex,
              ...Hex[],
            ],
        });

      const args = decoded.args;

      if (
        getAddress(args.owner)
        === input.owner
        && args.referenceId
        === input.referenceId
        && args.startAt
        === input.startAt
        && args.endAt
        === input.endAt
      ) {
        commitmentId =
          args.commitmentId;

        break;
      }
    } catch {
      // Ignore unrelated logs from the same transaction.
    }
  }

  if (commitmentId === null) {
    throw new CommitmentConfirmationError(
      "Commitment creation event was not found in the confirmed transaction.",
      false,
    );
  }

  const record =
    normalizeRecord(
      await input.readContract({
        address: input.manager,
        abi: commitmentManagerAbi,
        functionName:
          "commitments",
        args: [commitmentId],
      }),
    );

  const [
    settledOwner,
    settledReference,
    ,
    settledStart,
    settledEnd,
    ,
    status,
  ] = record;

  if (
    settledOwner !== input.owner
    || settledReference
    !== input.referenceId
    || settledStart
    !== input.startAt
    || settledEnd
    !== input.endAt
    || status < 1
    || status > 4
  ) {
    throw new CommitmentConfirmationError(
      "The settled commitment state did not match the API draft.",
      false,
    );
  }

  return {
    commitmentId,
    referenceId:
      input.referenceId,
    owner: input.owner,
    transactionHash:
      input.transactionHash,
  };
}

export async function readCommitmentRewardState(
  input: {
    readonly manager: Address;
    readonly commitmentId: string;
    readonly readContract:
    ContractReader["readContract"];
  },
): Promise<CommitmentRewardState> {
  const commitmentId =
    parseCommitmentId(
      input.commitmentId,
    );

  const record =
    normalizeRecord(
      await input.readContract({
        address: input.manager,
        abi: commitmentManagerAbi,
        functionName:
          "commitments",
        args: [commitmentId],
      }),
    );

  const [
    owner,
    ,
    ,
    ,
    ,
    rewardAssets,
    status,
    rewardClaimed,
  ] = record;

  return {
    owner,
    rewardAssets,
    rewardClaimed,
    status,
  };
}

export function buildClaimRewardTransaction(
  input: {
    readonly manager: Address;
    readonly chainId: number;
    readonly commitmentId: string;
  },
): UnsignedVaultTransaction {
  const commitmentId =
    parseCommitmentId(
      input.commitmentId,
    );

  return {
    to: input.manager,
    chainId: input.chainId,
    data: encodeFunctionData({
      abi: commitmentManagerAbi,
      functionName:
        "claimReward",
      args: [commitmentId],
    }),
  };
}