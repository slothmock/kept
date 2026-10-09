import { randomUUID } from "node:crypto";

import {
  and,
  eq,
  lte,
  sql,
} from "drizzle-orm";

import {
  decodeEventLog,
  getAddress,
  parseAbiItem,
  type Address,
  type Hex,
} from "viem";

import type { KeptDatabase } from "./db/client.js";
import {
  vaultActivityCursors,
  vaultActivityEvents,
} from "./db/schema.js";

const depositEvent = parseAbiItem(
  "event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)",
);

const withdrawEvent = parseAbiItem(
  "event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)",
);

const vaultActivityAbi = [
  depositEvent,
  withdrawEvent,
] as const;

const RPC_BLOCK_RANGE = 100n;
const MAX_BLOCK_BATCHES_PER_PASS = 10;
const RPC_TIMEOUT_MS = 15_000;
const RPC_REQUEST_DELAY_MS = 150;
const CONFIRMATION_DEPTH = 2n;

interface RawIndexedLog {
  readonly data: Hex;
  readonly topics: readonly Hex[];
  readonly blockNumber: bigint | null;
  readonly transactionHash: Hex | null;
  readonly logIndex: number | null;
}

interface IndexPublicClient {
  getChainId(): Promise<number>;
  getBlockNumber(): Promise<bigint>;
  getBlock(input: {
    readonly blockNumber: bigint;
  }): Promise<{
    readonly number: bigint;
    readonly timestamp: bigint;
  }>;
  getLogs(input: {
    readonly address: Address;
    readonly fromBlock: bigint;
    readonly toBlock: bigint;
  }): Promise<readonly RawIndexedLog[]>;
}

export interface IndexedVaultActivity {
  readonly depositedAssets: bigint;
  readonly withdrawnAssets: bigint;
  readonly netAssets: bigint;
}

export interface VaultActivityIndexStatus {
  readonly ready: boolean;
  readonly startBlock: bigint | null;
  readonly currentBlock: bigint | null;
  readonly targetBlock: bigint | null;
  readonly progressPercent: number | null;
}

export interface VaultActivityIndex {
  isReady(): boolean;
  status(): VaultActivityIndexStatus;
  syncToHead(): Promise<{
    readonly fromBlock: bigint;
    readonly toBlock: bigint;
    readonly eventsIndexed: number;
    readonly status: VaultActivityIndexStatus;
  } | null>;
  readAccountActivity(
    account: string,
    throughBlock?: bigint,
  ): Promise<IndexedVaultActivity>;
}

export async function withVaultIndexTimeout<T>(
  operation: Promise<T>,
  description: string,
  timeoutMs = RPC_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Vault activity index RPC timed out: ${description}`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function waitForRpcBudget(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, RPC_REQUEST_DELAY_MS);
  });
}

async function findFirstBlockAtOrAfter(
  publicClient: IndexPublicClient,
  targetTimestamp: bigint,
  latestBlock: bigint,
): Promise<bigint> {
  let low = 0n;
  let high = latestBlock;

  while (low < high) {
    const middle =
      low + (high - low) / 2n;

    const block =
      await withVaultIndexTimeout(
        publicClient.getBlock({ blockNumber: middle }),
        "getBlock",
      );

    if (block.timestamp < targetTimestamp) {
      low = middle + 1n;
    } else {
      high = middle;
    }

    await waitForRpcBudget();
  }

  return low;
}

function progressPercent(
  startBlock: bigint | null,
  currentBlock: bigint | null,
  targetBlock: bigint | null,
): number | null {
  if (
    startBlock === null
    || currentBlock === null
    || targetBlock === null
  ) {
    return null;
  }

  if (targetBlock <= startBlock) {
    return currentBlock >= targetBlock
      ? 100
      : 0;
  }

  const completed =
    currentBlock <= startBlock
      ? 0n
      : currentBlock - startBlock;

  const total =
    targetBlock - startBlock;

  const basisPoints =
    completed >= total
      ? 10_000n
      : completed * 10_000n / total;

  return Number(basisPoints) / 100;
}

function decodeIndexedLog(
  log: RawIndexedLog,
): {
  readonly type: "DEPOSIT" | "WITHDRAW";
  readonly owner: Address;
  readonly assets: bigint;
  readonly shares: bigint;
  readonly blockNumber: bigint;
  readonly transactionHash: Hex;
  readonly logIndex: number;
} | null {
  if (
    log.blockNumber === null
    || log.transactionHash === null
    || log.logIndex === null
    || log.topics.length === 0
  ) {
    return null;
  }

  try {
    const decoded =
      decodeEventLog({
        abi: vaultActivityAbi,
        data: log.data,
        topics: log.topics as [
          Hex,
          ...Hex[],
        ],
      });

    if (
      decoded.eventName !== "Deposit"
      && decoded.eventName !== "Withdraw"
    ) {
      return null;
    }

    const owner =
      decoded.args.owner;

    const assets =
      decoded.args.assets;

    const shares =
      decoded.args.shares;

    if (
      typeof owner !== "string"
      || typeof assets !== "bigint"
      || typeof shares !== "bigint"
      || assets < 0n
      || shares < 0n
    ) {
      throw new Error(
        "Vault activity log is incomplete",
      );
    }

    return {
      type:
        decoded.eventName === "Deposit"
          ? "DEPOSIT"
          : "WITHDRAW",
      owner:
        getAddress(owner),
      assets,
      shares,
      blockNumber:
        log.blockNumber,
      transactionHash:
        log.transactionHash,
      logIndex:
        log.logIndex,
    };
  } catch {
    // The vault emits events unrelated to account
    // deposit/withdraw accounting. Ignore them.
    return null;
  }
}

export function createVaultActivityIndex(input: {
  readonly db: KeptDatabase;
  readonly publicClient: IndexPublicClient;
  readonly vault: Address;
  readonly chainId: number;
  readonly startAt: Date;
}): VaultActivityIndex {
  let syncStartBlock: bigint | null = null;
  let processedBlock: bigint | null = null;
  let syncTargetBlock: bigint | null = null;
  let ready = false;

  function status(): VaultActivityIndexStatus {
    return {
      ready,
      startBlock:
        syncStartBlock,
      currentBlock:
        processedBlock,
      targetBlock:
        syncTargetBlock,
      progressPercent:
        ready
          ? 100
          : progressPercent(
            syncStartBlock,
            processedBlock,
            syncTargetBlock,
          ),
    };
  }

  async function assertChain(): Promise<void> {
    const liveChainId =
      await withVaultIndexTimeout(input.publicClient.getChainId(), "getChainId");

    if (liveChainId !== input.chainId) {
      throw new Error(
        `RPC chain ID does not match configured chain ${input.chainId}`,
      );
    }
  }

  async function findCursor() {
    const [cursor] =
      await input.db
        .select()
        .from(vaultActivityCursors)
        .where(
          and(
            eq(
              vaultActivityCursors.chainId,
              BigInt(input.chainId),
            ),
            sql`lower(${vaultActivityCursors.vaultAddress}) = lower(${input.vault})`,
          ),
        )
        .limit(1);

    return cursor ?? null;
  }

  async function resolveStartBlock(
    safeHead: bigint,
  ): Promise<bigint> {
    if (syncStartBlock !== null) {
      return syncStartBlock;
    }

    const timestamp =
      input.startAt.getTime();

    if (
      !Number.isSafeInteger(timestamp)
      || timestamp < 0
      || timestamp % 1_000 !== 0
    ) {
      throw new Error(
        "Vault activity index start time must use whole seconds",
      );
    }

    syncStartBlock =
      await findFirstBlockAtOrAfter(
        input.publicClient,
        BigInt(timestamp / 1_000),
        safeHead,
      );

    return syncStartBlock;
  }

  async function ensureCursor(
    safeHead: bigint,
  ) {
    const startBlock =
      await resolveStartBlock(
        safeHead,
      );

    const existing =
      await findCursor();

    if (existing) {
      processedBlock =
        existing.lastProcessedBlock;

      return existing;
    }

    const [created] =
      await input.db
        .insert(vaultActivityCursors)
        .values({
          id: randomUUID(),
          chainId: BigInt(input.chainId),
          vaultAddress: input.vault,
          lastProcessedBlock:
            startBlock === 0n
              ? 0n
              : startBlock - 1n,
          updatedAt: new Date(),
        })
        .returning();

    if (!created) {
      throw new Error(
        "Vault activity cursor was not created",
      );
    }

    processedBlock =
      created.lastProcessedBlock;

    return created;
  }

  async function persistChunk(
    cursorId: string,
    toBlock: bigint,
    logs: readonly RawIndexedLog[],
  ): Promise<number> {
    const rows =
      logs
        .map(decodeIndexedLog)
        .filter(
          (
            row,
          ): row is NonNullable<
            ReturnType<typeof decodeIndexedLog>
          > => row !== null,
        );

    await input.db.transaction(
      async (tx) => {
        if (rows.length > 0) {
          await tx
            .insert(vaultActivityEvents)
            .values(
              rows.map((row) => ({
                id: randomUUID(),
                chainId:
                  BigInt(input.chainId),
                vaultAddress:
                  input.vault,
                accountAddress:
                  row.owner,
                eventType:
                  row.type,
                assetsAtomic:
                  row.assets.toString(),
                sharesAtomic:
                  row.shares.toString(),
                blockNumber:
                  row.blockNumber,
                transactionHash:
                  row.transactionHash,
                logIndex:
                  row.logIndex,
                createdAt:
                  new Date(),
              })),
            )
            .onConflictDoNothing();
        }

        await tx
          .update(vaultActivityCursors)
          .set({
            lastProcessedBlock:
              toBlock,
            updatedAt:
              new Date(),
          })
          .where(
            eq(
              vaultActivityCursors.id,
              cursorId,
            ),
          );
      },
    );

    processedBlock =
      toBlock;

    return rows.length;
  }

  return {
    isReady: () => ready,

    status,

    async syncToHead() {
      await assertChain();

      const latest =
        await withVaultIndexTimeout(
          input.publicClient.getBlockNumber(),
          "getBlockNumber",
        );

      const safeHead =
        latest > CONFIRMATION_DEPTH
          ? latest - CONFIRMATION_DEPTH
          : 0n;

      syncTargetBlock =
        safeHead;

      const cursor =
        await ensureCursor(
          safeHead,
        );

      let fromBlock =
        cursor.lastProcessedBlock + 1n;

      if (fromBlock > safeHead) {
        processedBlock =
          cursor.lastProcessedBlock;

        ready = true;

        return null;
      }

      // Once the initial backfill has completed, keep the
      // index readable while small incremental catch-up passes run.
      const firstBlock =
        fromBlock;

      let eventsIndexed = 0;
      let batchesProcessed = 0;

      while (fromBlock <= safeHead && batchesProcessed < MAX_BLOCK_BATCHES_PER_PASS) {
        const candidateTo =
          fromBlock
          + RPC_BLOCK_RANGE
          - 1n;

        const toBlock =
          candidateTo < safeHead
            ? candidateTo
            : safeHead;

        const logs =
          await withVaultIndexTimeout(
            input.publicClient.getLogs({
              address: input.vault,
              fromBlock,
              toBlock,
            }),
            "getLogs",
          );

        eventsIndexed +=
          await persistChunk(
            cursor.id,
            toBlock,
            logs,
          );

        fromBlock =
          toBlock + 1n;
        batchesProcessed += 1;

        if (fromBlock <= safeHead && batchesProcessed < MAX_BLOCK_BATCHES_PER_PASS) {
          await waitForRpcBudget();
        }
      }

      ready = processedBlock !== null && processedBlock >= safeHead;

      return {
        fromBlock:
          firstBlock,
        toBlock:
          safeHead,
        eventsIndexed,
        status:
          status(),
      };
    },

    async readAccountActivity(
      account: string,
      throughBlock?: bigint,
    ): Promise<IndexedVaultActivity> {
      if (!ready) {
        throw new Error(
          "Vault activity index is still synchronizing",
        );
      }

      const normalized =
        getAddress(account);

      const [result] =
        await input.db
          .select({
            depositedAssets:
              sql<string>`
                coalesce(
                  sum(${vaultActivityEvents.assetsAtomic})
                  filter (
                    where ${vaultActivityEvents.eventType} = 'DEPOSIT'
                  ),
                  0
                )
              `,
            withdrawnAssets:
              sql<string>`
                coalesce(
                  sum(${vaultActivityEvents.assetsAtomic})
                  filter (
                    where ${vaultActivityEvents.eventType} = 'WITHDRAW'
                  ),
                  0
                )
              `,
          })
          .from(
            vaultActivityEvents,
          )
          .where(
            and(
              eq(
                vaultActivityEvents.chainId,
                BigInt(input.chainId),
              ),
              sql`lower(${vaultActivityEvents.vaultAddress}) = lower(${input.vault})`,
              sql`lower(${vaultActivityEvents.accountAddress}) = lower(${normalized})`,
              ...(throughBlock !== undefined
                ? [
                  lte(
                    vaultActivityEvents.blockNumber,
                    throughBlock,
                  ),
                ]
                : []),
            ),
          );

      const depositedAssets =
        BigInt(
          result?.depositedAssets
          ?? "0",
        );

      const withdrawnAssets =
        BigInt(
          result?.withdrawnAssets
          ?? "0",
        );

      return {
        depositedAssets,
        withdrawnAssets,
        netAssets:
          depositedAssets
          - withdrawnAssets,
      };
    },
  };
}
