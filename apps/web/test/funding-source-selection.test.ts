import {
    describe,
    expect,
    it,
} from "vitest";

import type {
    FundingAsset,
} from "../src/features/funding/intents/supported-tokens.js";
import {
    filterFundingAssetsByBlockchain,
    filterFundingAssetsForWallet,
    findFundingSourceAsset,
    listFundingSourceBlockchains,
    selectFundingSourceAssetId,
    selectFundingSourceBlockchain,
} from "../src/features/funding/funding-source-selection.js";

const assets:
    readonly FundingAsset[] = [
        {
            assetId:
                "eth-native",
            symbol:
                "ETH",
            blockchain:
                "eth",
            contractAddress:
                null,
            decimals:
                18,
            kind:
                "native",
        },
        {
            assetId:
                "base-usdc",
            symbol:
                "USDC",
            blockchain:
                "base",
            contractAddress:
                "0x1",
            decimals:
                6,
            kind:
                "token",
        },
        {
            assetId:
                "sol-usdc",
            symbol:
                "USDC",
            blockchain:
                "sol",
            contractAddress:
                "mint",
            decimals:
                6,
            kind:
                "token",
        },
        {
            assetId:
                "unsupported-usdc",
            symbol:
                "USDC",
            blockchain:
                "polygon",
            contractAddress:
                "0x2",
            decimals:
                6,
            kind:
                "token",
        },
    ];

describe(
    "funding source selection",
    () => {
        it(
            "filters supported assets by wallet family",
            () => {
                expect(
                    filterFundingAssetsForWallet(
                        assets,
                        "evm",
                    ).map(
                        (
                            asset,
                        ) =>
                            asset.assetId,
                    ),
                ).toEqual([
                    "eth-native",
                    "base-usdc",
                ]);

                expect(
                    filterFundingAssetsForWallet(
                        assets,
                        "sol",
                    ).map(
                        (
                            asset,
                        ) =>
                            asset.assetId,
                    ),
                ).toEqual([
                    "sol-usdc",
                ]);
            },
        );

        it(
            "orders available source networks consistently",
            () => {
                expect(
                    listFundingSourceBlockchains(
                        assets,
                    ),
                ).toEqual([
                    "eth",
                    "base",
                    "sol",
                ]);
            },
        );

        it(
            "keeps a compatible current network and otherwise prefers Base for EVM or Solana for Solana",
            () => {
                expect(
                    selectFundingSourceBlockchain(
                        assets,
                        "evm",
                        "eth",
                    ),
                ).toBe(
                    "eth",
                );

                expect(
                    selectFundingSourceBlockchain(
                        assets,
                        "evm",
                        "sol",
                    ),
                ).toBe(
                    "base",
                );

                expect(
                    selectFundingSourceBlockchain(
                        assets,
                        "sol",
                        "base",
                    ),
                ).toBe(
                    "sol",
                );
            },
        );

        it(
            "keeps a compatible current asset and otherwise prefers family USDC",
            () => {
                expect(
                    selectFundingSourceAssetId(
                        assets,
                        "evm",
                        "eth-native",
                    ),
                ).toBe(
                    "eth-native",
                );

                expect(
                    selectFundingSourceAssetId(
                        assets,
                        "evm",
                        "sol-usdc",
                    ),
                ).toBe(
                    "base-usdc",
                );

                expect(
                    selectFundingSourceAssetId(
                        assets,
                        "sol",
                        "base-usdc",
                    ),
                ).toBe(
                    "sol-usdc",
                );
            },
        );

        it(
            "finds and filters the selected source assets",
            () => {
                expect(
                    findFundingSourceAsset(
                        assets,
                        "base-usdc",
                    )?.symbol,
                ).toBe(
                    "USDC",
                );

                expect(
                    filterFundingAssetsByBlockchain(
                        assets,
                        "base",
                    ).map(
                        (
                            asset,
                        ) =>
                            asset.assetId,
                    ),
                ).toEqual([
                    "base-usdc",
                ]);
            },
        );
    },
);
