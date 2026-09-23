import {
  decodeEventLog,
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  hexToBytes,
  keccak256,
  toBytes,
  toHex,
  type Address,
  type Hex,
} from "viem";

export const commitmentManagerReadAbi = [
  {
    type: "function",
    name: "commitments",
    stateMutability: "view",
    inputs: [{ name: "commitmentId", type: "uint256" }],
    outputs: [
      { name: "owner", type: "address" },
      { name: "referenceId", type: "bytes32" },
      { name: "createdAt", type: "uint64" },
      { name: "startAt", type: "uint64" },
      { name: "endAt", type: "uint64" },
      { name: "rewardAssets", type: "uint256" },
      { name: "status", type: "uint8" },
      { name: "rewardClaimed", type: "bool" },
    ],
  },
] as const;

const commitmentManagerCreateAbi = [{
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

const commitmentManagerCreatedEventAbi = [{
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

const UINT256_MAX = (1n << 256n) - 1n;

export class CommitmentSettlementMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommitmentSettlementMismatchError";
  }
}

export class CommitmentSettlementUnavailableError extends Error {
  constructor(message = "Commitment settlement verification is unavailable") {
    super(message);
    this.name = "CommitmentSettlementUnavailableError";
  }
}

export function referenceIdForCommitment(commitmentId: string): Hex {
  return keccak256(toBytes(commitmentId));
}

function parseCommitmentId(value: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new CommitmentSettlementMismatchError("Onchain commitment ID must be an unsigned integer");
  }
  const parsed = BigInt(value);
  if (parsed < 1n || parsed > UINT256_MAX) {
    throw new CommitmentSettlementMismatchError("Onchain commitment ID is outside uint256 range");
  }
  return parsed;
}

export function encodeOnchainCommitmentId(value: string): Uint8Array {
  return hexToBytes(toHex(parseCommitmentId(value), { size: 32 }));
}

export function decodeOnchainCommitmentId(value: Uint8Array): string {
  if (value.length !== 32) {
    throw new CommitmentSettlementMismatchError("Stored settlement reference is not a uint256");
  }
  return BigInt(toHex(value)).toString();
}

function timestampSeconds(value: Date): bigint {
  const milliseconds = value.getTime();
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0 || milliseconds % 1_000 !== 0) {
    throw new CommitmentSettlementMismatchError("Commitment timestamps must use whole seconds");
  }
  return BigInt(milliseconds / 1_000);
}

interface SettlementPublicClient {
  getChainId(): Promise<number>;
  getTransaction(input: { readonly hash: Hex }): Promise<{
    readonly from: Address;
    readonly to: Address | null;
    readonly input: Hex;
  }>;
  getTransactionReceipt(input: { readonly hash: Hex }): Promise<{
    readonly status: "success" | "reverted";
    readonly blockNumber: bigint;
    readonly logs: readonly {
      readonly address: Address;
      readonly data: Hex;
      readonly topics: readonly Hex[];
    }[];
  }>;
  getBlockNumber(): Promise<bigint>;
  readContract(input: {
    readonly address: Address;
    readonly abi: typeof commitmentManagerReadAbi;
    readonly functionName: "commitments";
    readonly args: readonly [bigint];
  }): Promise<unknown>;
}

export interface VerifiedCommitmentSettlement {
  readonly settlementRef: Uint8Array;
  readonly owner: Address;
  readonly chainId: number;
  readonly status: number;
}

export interface CommitmentSettlementVerifier {
  inspect(input: {
    readonly offchainCommitmentId: string;
    readonly onchainCommitmentId: string;
    readonly startAt: Date;
    readonly endAt: Date;
  }): Promise<VerifiedCommitmentSettlement>;
  verifyActive(input: {
    readonly offchainCommitmentId: string;
    readonly onchainCommitmentId: string;
    readonly transactionHash: Hex;
    readonly startAt: Date;
    readonly endAt: Date;
  }): Promise<VerifiedCommitmentSettlement>;
  verifyCancelled(input: {
    readonly offchainCommitmentId: string;
    readonly onchainCommitmentId: string;
    readonly owner: string;
    readonly startAt: Date;
    readonly endAt: Date;
  }): Promise<VerifiedCommitmentSettlement>;
}

function normalizeRecord(value: unknown): readonly [Address, Hex, bigint, bigint, bigint, number] {
  if (!Array.isArray(value) || value.length !== 8) {
    throw new CommitmentSettlementMismatchError("CommitmentManager returned an invalid record");
  }
  const [owner, referenceId, createdAt, startAt, endAt, , status] = value;
  if (
    typeof owner !== "string"
    || typeof referenceId !== "string"
    || typeof createdAt !== "bigint"
    || typeof startAt !== "bigint"
    || typeof endAt !== "bigint"
    || (typeof status !== "number" && typeof status !== "bigint")
  ) {
    throw new CommitmentSettlementMismatchError("CommitmentManager returned an invalid record");
  }
  const normalizedStatus = typeof status === "bigint" ? Number(status) : status;
  if (!Number.isSafeInteger(normalizedStatus)) {
    throw new CommitmentSettlementMismatchError("CommitmentManager returned an invalid status");
  }
  return [getAddress(owner), referenceId as Hex, createdAt, startAt, endAt, normalizedStatus];
}

export function createCommitmentSettlementVerifier(input: {
  readonly publicClient: SettlementPublicClient;
  readonly manager: Address;
  readonly chainId: number;
}): CommitmentSettlementVerifier {
  async function verifyStatus(
    candidate: {
      readonly offchainCommitmentId: string;
      readonly onchainCommitmentId: string;
      readonly startAt: Date;
      readonly endAt: Date;
    },
    expectedStatus: 1 | 4 | undefined,
    expectedOwner: Address,
  ): Promise<VerifiedCommitmentSettlement> {
    const liveChainId = await input.publicClient.getChainId();
    if (liveChainId !== input.chainId) {
      throw new CommitmentSettlementMismatchError(
        `Commitment RPC chain mismatch: expected ${input.chainId}, received ${liveChainId}`,
      );
    }

    const commitmentId = parseCommitmentId(candidate.onchainCommitmentId);
    const record = normalizeRecord(await input.publicClient.readContract({
      address: input.manager,
      abi: commitmentManagerReadAbi,
      functionName: "commitments",
      args: [commitmentId],
    }));
    const [owner, referenceId, , startAt, endAt, status] = record;
    if (
      owner !== expectedOwner
      || referenceId !== referenceIdForCommitment(candidate.offchainCommitmentId)
      || startAt !== timestampSeconds(candidate.startAt)
      || endAt !== timestampSeconds(candidate.endAt)
      || status < 1
      || status > 4
      || (expectedStatus !== undefined && status !== expectedStatus)
    ) {
      throw new CommitmentSettlementMismatchError("Onchain commitment does not match the API record");
    }

    return {
      settlementRef: encodeOnchainCommitmentId(candidate.onchainCommitmentId),
      owner,
      chainId: input.chainId,
      status,
    };
  }

  async function inspect(
    candidate: Parameters<CommitmentSettlementVerifier["inspect"]>[0],
  ): Promise<VerifiedCommitmentSettlement> {
    const liveChainId = await input.publicClient.getChainId();
    if (liveChainId !== input.chainId) {
      throw new CommitmentSettlementMismatchError(
        `Commitment RPC chain mismatch: expected ${input.chainId}, received ${liveChainId}`,
      );
    }
    const commitmentId = parseCommitmentId(candidate.onchainCommitmentId);
    const record = normalizeRecord(await input.publicClient.readContract({
      address: input.manager,
      abi: commitmentManagerReadAbi,
      functionName: "commitments",
      args: [commitmentId],
    }));
    const [owner, referenceId, , startAt, endAt, status] = record;
    if (
      referenceId !== referenceIdForCommitment(candidate.offchainCommitmentId)
      || startAt !== timestampSeconds(candidate.startAt)
      || endAt !== timestampSeconds(candidate.endAt)
    ) {
      throw new CommitmentSettlementMismatchError("Onchain commitment does not match the API record");
    }
    return {
      settlementRef: encodeOnchainCommitmentId(candidate.onchainCommitmentId),
      owner,
      chainId: input.chainId,
      status,
    };
  }

  return {
    inspect,
    verifyActive: async (candidate) => {
      if (!/^0x[0-9a-fA-F]{64}$/.test(candidate.transactionHash)) {
        throw new CommitmentSettlementMismatchError("Commitment transaction hash is invalid");
      }
      const transaction = await input.publicClient.getTransaction({
        hash: candidate.transactionHash,
      });
      let decoded: ReturnType<typeof decodeFunctionData<typeof commitmentManagerCreateAbi>>;
      try {
        decoded = decodeFunctionData({
          abi: commitmentManagerCreateAbi,
          data: transaction.input,
        });
      } catch {
        throw new CommitmentSettlementMismatchError("Commitment transaction calldata is invalid");
      }
      const expectedReference = referenceIdForCommitment(candidate.offchainCommitmentId);
      if (
        !transaction.to
        || getAddress(transaction.to) !== input.manager
        || decoded.functionName !== "createCommitment"
        || decoded.args[0] !== expectedReference
        || decoded.args[1] !== timestampSeconds(candidate.startAt)
        || decoded.args[2] !== timestampSeconds(candidate.endAt)
        || transaction.input.toLowerCase() !== encodeFunctionData({
          abi: commitmentManagerCreateAbi,
          functionName: "createCommitment",
          args: [
            expectedReference,
            timestampSeconds(candidate.startAt),
            timestampSeconds(candidate.endAt),
          ],
        }).toLowerCase()
      ) {
        throw new CommitmentSettlementMismatchError(
          "Commitment transaction does not match the API record",
        );
      }
      const receipt =
        await input.publicClient.getTransactionReceipt({
          hash: candidate.transactionHash,
        });

      const currentBlock =
        await input.publicClient.getBlockNumber();

      const requiredConfirmations =
        input.chainId === 31337
          ? 1n
          : 2n;

      const confirmations =
        currentBlock - receipt.blockNumber + 1n;

      if (
        receipt.status !== "success"
        || confirmations < requiredConfirmations
      ) {
        throw new CommitmentSettlementMismatchError(
          "Commitment transaction is not successfully confirmed",
        );
      }
      const commitmentId = parseCommitmentId(candidate.onchainCommitmentId);
      const owner = getAddress(transaction.from);
      const matchingEvent = receipt.logs.some((log) => {
        if (getAddress(log.address) !== input.manager || log.topics.length === 0) return false;
        try {
          const decodedEvent = decodeEventLog({
            abi: commitmentManagerCreatedEventAbi,
            eventName: "CommitmentCreated",
            data: log.data,
            topics: log.topics as [Hex, ...Hex[]],
          });
          return decodedEvent.args.commitmentId === commitmentId
            && getAddress(decodedEvent.args.owner) === owner
            && decodedEvent.args.referenceId === expectedReference
            && decodedEvent.args.startAt === timestampSeconds(candidate.startAt)
            && decodedEvent.args.endAt === timestampSeconds(candidate.endAt);
        } catch {
          return false;
        }
      });
      if (!matchingEvent) {
        throw new CommitmentSettlementMismatchError(
          "Commitment transaction receipt does not contain the expected event",
        );
      }
      return verifyStatus(candidate, undefined, owner);
    },
    verifyCancelled: (candidate) => {
      let owner: Address;
      try {
        owner = getAddress(candidate.owner);
      } catch {
        throw new CommitmentSettlementMismatchError("Commitment owner is not a valid address");
      }
      return verifyStatus(candidate, 4, owner);
    },
  };
}
