import {
    getAddress,
    parseAbiItem,
    type Address,
} from "viem";

const depositEvent = parseAbiItem(
    "event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)",
);

const withdrawEvent = parseAbiItem(
    "event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)",
);

interface Block {
    readonly number: bigint;
    readonly timestamp: bigint;
}

interface DepositLog {
    readonly args: {
        readonly sender?: Address;
        readonly owner?: Address;
        readonly assets?: bigint;
        readonly shares?: bigint;
    };
}

interface WithdrawLog {
    readonly args: {
        readonly sender?: Address;
        readonly receiver?: Address;
        readonly owner?: Address;
        readonly assets?: bigint;
        readonly shares?: bigint;
    };
}

interface VaultActivityPublicClient {
    getChainId(): Promise<number>;

    getBlockNumber(): Promise<bigint>;

    getBlock(input: {
        readonly blockNumber: bigint;
    }): Promise<Block>;

    getLogs(input: {
        readonly address: Address;
        readonly event:
        | typeof depositEvent
        | typeof withdrawEvent;
        readonly args: {
            readonly owner: Address;
        };
        readonly fromBlock: bigint;
        readonly toBlock: bigint;
    }): Promise<
        readonly (
            | DepositLog
            | WithdrawLog
        )[]
    >;
}

export interface VaultSavingsActivity {
    readonly depositedAssets: bigint;
    readonly withdrawnAssets: bigint;
    readonly netAssets: bigint;
}

export interface VaultSavingsActivityReader {
    readActivity(input: {
        readonly account: string;
        readonly startAt: Date;
        readonly endAt: Date;
    }): Promise<VaultSavingsActivity>;
}

function timestampSeconds(
    value: Date,
    field: string,
): bigint {
    const milliseconds =
        value.getTime();

    if (
        !Number.isSafeInteger(milliseconds)
        || milliseconds < 0
        || milliseconds % 1_000 !== 0
    ) {
        throw new Error(
            `${field} must use whole seconds`,
        );
    }

    return BigInt(
        milliseconds / 1_000,
    );
}

async function findFirstBlockAtOrAfter(
    publicClient: VaultActivityPublicClient,
    targetTimestamp: bigint,
    latestBlock: bigint,
): Promise<bigint | null> {
    const latest =
        await publicClient.getBlock({
            blockNumber: latestBlock,
        });

    if (
        latest.timestamp
        < targetTimestamp
    ) {
        return null;
    }

    let low = 0n;
    let high = latestBlock;

    while (low < high) {
        const middle =
            low + (high - low) / 2n;

        const block =
            await publicClient.getBlock({
                blockNumber: middle,
            });

        if (
            block.timestamp
            < targetTimestamp
        ) {
            low = middle + 1n;
        } else {
            high = middle;
        }
    }

    return low;
}

async function findLastBlockAtOrBefore(
    publicClient: VaultActivityPublicClient,
    targetTimestamp: bigint,
    latestBlock: bigint,
): Promise<bigint | null> {
    const genesis =
        await publicClient.getBlock({
            blockNumber: 0n,
        });

    if (
        genesis.timestamp
        > targetTimestamp
    ) {
        return null;
    }

    let low = 0n;
    let high = latestBlock;

    while (low < high) {
        const middle =
            low
            + (high - low + 1n) / 2n;

        const block =
            await publicClient.getBlock({
                blockNumber: middle,
            });

        if (
            block.timestamp
            <= targetTimestamp
        ) {
            low = middle;
        } else {
            high = middle - 1n;
        }
    }

    return low;
}

const RPC_LOG_BLOCK_RANGE = 100n;

async function getLogsInChunks(
    publicClient: VaultActivityPublicClient,
    input: {
        readonly address: Address;
        readonly event:
        | typeof depositEvent
        | typeof withdrawEvent;
        readonly owner: Address;
        readonly fromBlock: bigint;
        readonly toBlock: bigint;
    },
): Promise<
    readonly (
        | DepositLog
        | WithdrawLog
    )[]
> {
    const logs: (
        | DepositLog
        | WithdrawLog
    )[] = [];

    let chunkFrom =
        input.fromBlock;

    while (
        chunkFrom
        <= input.toBlock
    ) {
        const candidateTo =
            chunkFrom
            + RPC_LOG_BLOCK_RANGE
            - 1n;

        const chunkTo =
            candidateTo
            < input.toBlock
                ? candidateTo
                : input.toBlock;

        const chunk =
            await publicClient.getLogs({
                address: input.address,
                event: input.event,
                args: {
                    owner: input.owner,
                },
                fromBlock: chunkFrom,
                toBlock: chunkTo,
            });

        logs.push(...chunk);

        chunkFrom =
            chunkTo + 1n;
    }

    return logs;
}

function sumAssets(
    logs: readonly (
        | DepositLog
        | WithdrawLog
    )[],
): bigint {
    return logs.reduce(
        (total, log) => {
            const assets =
                log.args.assets;

            if (
                typeof assets
                !== "bigint"
            ) {
                throw new Error(
                    "Vault activity log is missing assets",
                );
            }

            if (assets < 0n) {
                throw new Error(
                    "Vault activity log contains negative assets",
                );
            }

            return total + assets;
        },
        0n,
    );
}

export function createVaultSavingsActivityReader(
    input: {
        readonly publicClient:
        VaultActivityPublicClient;

        readonly vault: Address;

        readonly chainId: number;
    },
): VaultSavingsActivityReader {
    return {
        async readActivity(
            activity,
        ): Promise<VaultSavingsActivity> {
            const account =
                getAddress(activity.account);

            const startTimestamp =
                timestampSeconds(
                    activity.startAt,
                    "startAt",
                );

            const endTimestamp =
                timestampSeconds(
                    activity.endAt,
                    "endAt",
                );

            if (
                endTimestamp
                < startTimestamp
            ) {
                throw new Error(
                    "Vault activity period is invalid",
                );
            }

            const liveChainId =
                await input.publicClient
                    .getChainId();

            if (
                liveChainId
                !== input.chainId
            ) {
                throw new Error(
                    `RPC chain ID does not match configured chain ${input.chainId}`,
                );
            }

            const latestBlock =
                await input.publicClient
                    .getBlockNumber();

            const [
                fromBlock,
                toBlock,
            ] = await Promise.all([
                findFirstBlockAtOrAfter(
                    input.publicClient,
                    startTimestamp,
                    latestBlock,
                ),

                findLastBlockAtOrBefore(
                    input.publicClient,
                    endTimestamp,
                    latestBlock,
                ),
            ]);

            if (
                fromBlock === null
                || toBlock === null
                || fromBlock > toBlock
            ) {
                return {
                    depositedAssets: 0n,
                    withdrawnAssets: 0n,
                    netAssets: 0n,
                };
            }

            const [
                deposits,
                withdrawals,
            ] = await Promise.all([
                getLogsInChunks(
                    input.publicClient,
                    {
                        address: input.vault,
                        event: depositEvent,
                        owner: account,
                        fromBlock,
                        toBlock,
                    },
                ),

                getLogsInChunks(
                    input.publicClient,
                    {
                        address: input.vault,
                        event: withdrawEvent,
                        owner: account,
                        fromBlock,
                        toBlock,
                    },
                ),
            ]);

            const depositedAssets =
                sumAssets(deposits);

            const withdrawnAssets =
                sumAssets(withdrawals);

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