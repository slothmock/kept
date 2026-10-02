import {
    createPublicClient,
    erc20Abi,
    formatUnits,
    http,
} from "viem";

import {
    arbitrum,
    base,
    mainnet,
    optimism,
} from "viem/chains";

import type {
    FundingAsset,
} from "@/features/funding/intents/supported-tokens";

const FUNDING_CHAINS = {
    eth:
        mainnet,

    ethereum:
        mainnet,

    base,

    arb:
        arbitrum,

    arbitrum,

    op:
        optimism,

    optimism,
} as const;

export interface FundingAssetBalance {
    readonly assetId:
    string;

    readonly balance:
    bigint | null;
}

function getFundingChain(
    blockchain:
        string,
) {
    return FUNDING_CHAINS[
        blockchain as keyof typeof FUNDING_CHAINS
    ];
}

type SolanaBalanceReader = (
    owner: string,
) => Promise<{
    readonly nativeBalance: string;
    readonly balances: Readonly<Record<string, string>>;
}>;

async function readSolanaBalances(
    address: string,
    assets: readonly FundingAsset[],
    readBalances: SolanaBalanceReader,
): Promise<
    readonly FundingAssetBalance[]
> {
    const result =
        await readBalances(
            address,
        );

    return assets.map(
        (
            asset,
        ): FundingAssetBalance => {
            if (
                asset.kind ===
                "native"
            ) {
                return {
                    assetId:
                        asset.assetId,

                    balance:
                        BigInt(
                            result.nativeBalance,
                        ),
                };
            }

            if (
                !asset.contractAddress
            ) {
                return {
                    assetId:
                        asset.assetId,

                    balance:
                        null,
                };
            }

            const balance =
                result.balances[
                    asset.contractAddress
                ];

            return {
                assetId:
                    asset.assetId,

                balance:
                    balance ===
                    undefined
                        ? 0n
                        : BigInt(
                            balance,
                        ),
            };
        },
    );
}

export async function readFundingAssetBalances(
    address: string,
    assets: readonly FundingAsset[],
    readSolanaFundingBalances?: SolanaBalanceReader,
): Promise<
    readonly FundingAssetBalance[]
> {
    const assetsByBlockchain =
        new Map<
            string,
            FundingAsset[]
        >();

    for (
        const asset of
        assets
    ) {
        const chainAssets =
            assetsByBlockchain.get(
                asset.blockchain,
            ) ??
            [];

        chainAssets.push(
            asset,
        );

        assetsByBlockchain.set(
            asset.blockchain,
            chainAssets,
        );
    }

    const groups =
        await Promise.all(
            Array.from(
                assetsByBlockchain.entries(),
            ).map(
                async ([
                    blockchain,
                    chainAssets,
                ]) => {
                    if (
                        blockchain ===
                        "sol"
                    ) {
                        if (
                            !readSolanaFundingBalances
                        ) {
                            return chainAssets.map(
                                (
                                    asset,
                                ) => ({
                                    assetId:
                                        asset.assetId,

                                    balance:
                                        null,
                                }),
                            );
                        }

                        return readSolanaBalances(
                            address,
                            chainAssets,
                            readSolanaFundingBalances,
                        );
                    }

                    const chain =
                        getFundingChain(
                            blockchain,
                        );

                    if (
                        !chain
                    ) {
                        return chainAssets.map(
                            (
                                asset,
                            ) => ({
                                assetId:
                                    asset.assetId,

                                balance:
                                    null,
                            }),
                        );
                    }

                    try {
                        const client =
                            createPublicClient({
                                chain,

                                transport:
                                    http(),
                            });

                        const evmAddress =
                            address as `0x${string}`;

                        const nativeAssets =
                            chainAssets.filter(
                                (
                                    asset,
                                ) =>
                                    asset.kind ===
                                    "native",
                            );

                        const tokenAssets =
                            chainAssets.filter(
                                (
                                    asset,
                                ) =>
                                    asset.kind ===
                                    "token" &&
                                    asset.contractAddress !==
                                    null,
                            );

                        const nativeBalance =
                            nativeAssets.length >
                            0
                                ? await client.getBalance({
                                    address:
                                        evmAddress,
                                }).catch(
                                    () => null,
                                )
                                : null;

                        const tokenResults =
                            tokenAssets.length >
                                0
                                ? await client.multicall({
                                    allowFailure:
                                        true,

                                    contracts:
                                        tokenAssets.map(
                                            (
                                                asset,
                                            ) => ({
                                                address:
                                                    asset.contractAddress as `0x${string}`,

                                                abi:
                                                    erc20Abi,

                                                functionName:
                                                    "balanceOf" as const,

                                                args: [
                                                    evmAddress,
                                                ] as const,
                                            }),
                                        ),
                                })
                                : [];

                        return [
                            ...nativeAssets.map(
                                (
                                    asset,
                                ) => ({
                                    assetId:
                                        asset.assetId,

                                    balance:
                                        nativeBalance,
                                }),
                            ),
                            ...tokenAssets.map(
                                (
                                    asset,
                                    index,
                                ) => ({
                                    assetId:
                                        asset.assetId,

                                    balance:
                                        tokenResults[
                                            index
                                        ]?.status ===
                                        "success"
                                            ? tokenResults[
                                                index
                                            ].result
                                            : null,
                                }),
                            ),
                        ];
                    } catch {
                        return chainAssets.map(
                            (
                                asset,
                            ) => ({
                                assetId:
                                    asset.assetId,

                                balance:
                                    null,
                            }),
                        );
                    }
                },
            ),
        );

    return groups.flat();
}

export function formatFundingAssetBalance(
    asset:
        FundingAsset,
    balance:
        bigint,
): string {
    const formatted =
        formatUnits(
            balance,
            asset.decimals,
        );

    const [
        whole = "0",
        fraction = "",
    ] =
        formatted.split(
            ".",
        );

    if (
        fraction.length ===
        0
    ) {
        return whole;
    }

    const trimmedFraction =
        fraction
            .slice(
                0,
                6,
            )
            .replace(
                /0+$/,
                "",
            );

    return trimmedFraction.length >
        0
        ? `${whole}.${trimmedFraction}`
        : whole;
}
