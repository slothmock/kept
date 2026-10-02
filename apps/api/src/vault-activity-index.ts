import { randomUUID } from "node:crypto";

import {
  and,
  eq,
  sql,
} from "drizzle-orm";

import {
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

const RPC_BLOCK_RANGE = 100n;
const RPC_REQUEST_DELAY_MS = 175;
const CONFIRMATION_DEPTH = 2n;

interface IndexedLog {
  readonly args: {
    readonly owner?: Address;
    readonly assets?: bigint;
  };
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
    readonly event:
      | typeof depositEvent
      | typeof withdrawEvent;
    readonly fromBlock: bigint;
    readonly toBlock: bigint;
  }): Promise<readonly IndexedLog[]>;
}

export interface IndexedVaultActivity {
  readonly depositedAssets: bigint;
  readonly withdrawnAssets: bigint;
  readonly netAssets: bigint;
}

export interface VaultActivityIndex {
  isReady(): boolean;
  syncToHead(): Promise<{
    readonly fromBlock: bigint;
    readonly toBlock: bigint;
    readonly eventsIndexed: number;
  } | null>;
  readAccountActivity(
    account: string,
  ): Promise<IndexedVaultActivity>;
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
      await publicClient.getBlock({
        blockNumber: middle,
      });

    if (block.timestamp < targetTimestamp) {
      low = middle + 1n;
    } else {
      high = middle;
    }

    await waitForRpcBudget();
  }

  return low;
}

function requireIndexedLog(
  log: IndexedLog,
): {
  readonly owner: Address;
  readonly assets: bigint;
  readonly blockNumber: bigint;
  readonly transactionHash: Hex;
  readonly logIndex: number;
} {
  if (
    !log.args.owner
    || typeof log.args.assets !== "bigint"
    || log.args.assets < 0n
    || log.blockNumber === null
    || log.transactionHash === null
    || log.logIndex === null
  ) {
    throw new Error(
      "Vault activity log is incomplete",
    );
  }

  return {
    owner: getAddress(log.args.owner),
    assets: log.args.assets,
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
    logIndex: log.logIndex,
  };
}

export function createVaultActivityIndex(input: {
  readonly db: KeptDatabase;
  readonly publicClient: IndexPublicClient;
  readonly vault: Address;
  readonly chainId: number;
  readonly startAt: Date;
}): VaultActivityIndex {
  let ready = false;

  async function assertChain(): Promise<void> {
    const liveChainId =
      await input.publicClient.getChainId();

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

  async function ensureCursor(
    safeHead: bigint,
  ) {
    const existing =
      await findCursor();

    if (existing) {
      return existing;
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

    const firstBlock =
      await findFirstBlockAtOrAfter(
        input.publicClient,
        BigInt(timestamp / 1_000),
        safeHead,
      );

    const [created] =
      await input.db
        .insert(vaultActivityCursors)
        .values({
          id: randomUUID(),
          chainId: BigInt(input.chainId),
          vaultAddress: input.vault,
          lastProcessedBlock:
            firstBlock === 0n
              ? 0n
              : firstBlock - 1n,
          updatedAt: new Date(),
        })
        .returning();

    if (!created) {
      throw new Error(
        "Vault activity cursor was not created",
      );
    }

    return created;
  }

  async function persistChunk(
    cursorId: string,
    toBlock: bigint,
    deposits: readonly IndexedLog[],
    withdrawals: readonly IndexedLog[],
  ): Promise<number> {
    const rows = [
      ...deposits.map((log) => ({
        type: "DEPOSIT" as const,
        log: requireIndexedLog(log),
      })),
      ...withdrawals.map((log) => ({
        type: "WITHDRAW" as const,
        log: requireIndexedLog(log),
      })),
    ];

    await input.db.transaction(
      async (tx) => {
        if (rows.length > 0) {
          await tx
            .insert(vaultActivityEvents)
            .values(
              rows.map(({ type, log }) => ({
                id: randomUUID(),
                chainId:
                  BigInt(input.chainId),
                vaultAddress:
                  input.vault,
                accountAddress:
                  log.owner,
                eventType:
                  type,
                assetsAtomic:
                  log.assets.toString(),
                blockNumber:
                  log.blockNumber,
                transactionHash:
                  log.transactionHash,
                logIndex:
                  log.logIndex,
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

    return rows.length;
  }

  return {
    isReady: () => ready,

    async syncToHead() {
      await assertChain();

      const latest =
        await input.publicClient
          .getBlockNumber();

      const safeHead =
        latest > CONFIRMATION_DEPTH
          ? latest - CONFIRMATION_DEPTH
          : 0n;

      const cursor =
        await ensureCursor(
          safeHead,
        );

      let fromBlock =
        cursor.lastProcessedBlock + 1n;

      if (fromBlock > safeHead) {
        ready = true;

        return null;
      }

      const firstBlock =
        fromBlock;

      let eventsIndexed = 0;

      while (fromBlock <= safeHead) {
        const candidateTo =
          fromBlock
          + RPC_BLOCK_RANGE
          - 1n;

        const toBlock =
          candidateTo < safeHead
            ? candidateTo
            : safeHead;

        const deposits =
          await input.publicClient
            .getLogs({
              address:
                input.vault,
              event:
                depositEvent,
              fromBlock,
              toBlock,
            });

        await waitForRpcBudget();

        const withdrawals =
          await input.publicClient
            .getLogs({
              address:
                input.vault,
              event:
                withdrawEvent,
              fromBlock,
              toBlock,
            });

        eventsIndexed +=
          await persistChunk(
            cursor.id,
            toBlock,
            deposits,
            withdrawals,
          );

        fromBlock =
          toBlock + 1n;

        if (fromBlock <= safeHead) {
          await waitForRpcBudget();
        }
      }

      ready = true;

      return {
        fromBlock:
          firstBlock,
        toBlock:
          safeHead,
        eventsIndexed,
      };
    },

    async readAccountActivity(
      account: string,
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
