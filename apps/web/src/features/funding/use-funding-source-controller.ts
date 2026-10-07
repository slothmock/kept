import {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react";

import {
    diagnostics,
} from "@/lib/diagnostics";
import {
    switchToFundingChain,
} from "@/features/funding/evm-funding-network";
import {
    filterFundingAssetsByBlockchain,
    filterFundingAssetsForWallet,
    findFundingSourceAsset,
    listFundingSourceBlockchains,
    selectFundingSourceAssetId,
    selectFundingSourceBlockchain,
} from "@/features/funding/funding-source-selection";
import {
    readFundingAssetBalances,
} from "@/features/funding/intents/funding-asset-balances";
import {
    resolveKeptFundingAssets,
    type FundingAsset,
} from "@/features/funding/intents/supported-tokens";
import type {
    ExternalFundingWallet,
} from "@/features/funding/use-external-funding-wallet";

interface UseFundingSourceControllerInput {
    readonly active:
    boolean;

    readonly externalWallet:
    ExternalFundingWallet;

    readonly readSolanaFundingBalances:
    (
        owner: string,
    ) => Promise<{
        readonly nativeBalance: string;
        readonly balances: Readonly<Record<string, string>>;
    }>;

    readonly invalidatePreview:
    () => void;

    readonly clearAmount:
    () => void;
}

export function useFundingSourceController({
    active,
    externalWallet,
    readSolanaFundingBalances,
    invalidatePreview,
    clearAmount,
}: UseFundingSourceControllerInput) {
    const [
        destinationAsset,
        setDestinationAsset,
    ] =
        useState<
            FundingAsset | null
        >(null);

    const [
        sourceBlockchain,
        setSourceBlockchain,
    ] =
        useState<
            string | null
        >(null);

    const [
        switchingSourceNetwork,
        setSwitchingSourceNetwork,
    ] =
        useState(false);

    const [
        sourceNetworkError,
        setSourceNetworkError,
    ] =
        useState<
            string | null
        >(null);

    const [
        sourceAssets,
        setSourceAssets,
    ] =
        useState<
            readonly FundingAsset[]
        >([]);

    const [
        sourceAssetId,
        setSourceAssetId,
    ] =
        useState<
            string | null
        >(null);

    const [
        sourceAssetBalances,
        setSourceAssetBalances,
    ] =
        useState<
            ReadonlyMap<
                string,
                bigint | null
            >
        >(
            new Map(),
        );

    const [
        sourceAssetBalancesLoading,
        setSourceAssetBalancesLoading,
    ] =
        useState(false);

    const [
        sourceAssetsLoading,
        setSourceAssetsLoading,
    ] =
        useState(false);

    const [
        sourceAssetsError,
        setSourceAssetsError,
    ] =
        useState<
            string | null
        >(null);

    const sourceAsset =
        useMemo(
            () =>
                findFundingSourceAsset(
                    sourceAssets,
                    sourceAssetId,
                ),
            [
                sourceAssetId,
                sourceAssets,
            ],
        );

    const walletCompatibleSourceAssets =
        useMemo(
            () =>
                filterFundingAssetsForWallet(
                    sourceAssets,
                    externalWallet.family,
                ),
            [
                externalWallet.family,
                sourceAssets,
            ],
        );

    const availableSourceBlockchains =
        useMemo(
            () =>
                listFundingSourceBlockchains(
                    walletCompatibleSourceAssets,
                ),
            [
                walletCompatibleSourceAssets,
            ],
        );

    const filteredSourceAssets =
        useMemo(
            () =>
                filterFundingAssetsByBlockchain(
                    walletCompatibleSourceAssets,
                    sourceBlockchain,
                ),
            [
                sourceBlockchain,
                walletCompatibleSourceAssets,
            ],
        );

    useEffect(
        () => {
            if (
                !active
            ) {
                return;
            }

            let cancelled =
                false;

            void (
                async () => {
                    setSourceAssetsLoading(
                        true,
                    );

                    setSourceAssetsError(
                        null,
                    );

                    try {
                        const {
                            origins,
                            destination,
                        } =
                            await resolveKeptFundingAssets();

                        if (
                            cancelled
                        ) {
                            return;
                        }

                        setSourceAssets(
                            origins,
                        );

                        setDestinationAsset(
                            destination,
                        );

                        setSourceBlockchain(
                            (
                                current,
                            ) =>
                                selectFundingSourceBlockchain(
                                    origins,
                                    externalWallet.family,
                                    current,
                                ),
                        );

                        setSourceAssetId(
                            (
                                current,
                            ) =>
                                selectFundingSourceAssetId(
                                    origins,
                                    externalWallet.family,
                                    current,
                                ),
                        );
                    } catch (
                        error
                    ) {
                        if (
                            cancelled
                        ) {
                            return;
                        }

                        setSourceAssets(
                            [],
                        );

                        setSourceAssetId(
                            null,
                        );

                        setSourceAssetsError(
                            error instanceof
                                Error
                                ? error.message
                                : "We couldn't load supported funding options.",
                        );
                    } finally {
                        if (
                            !cancelled
                        ) {
                            setSourceAssetsLoading(
                                false,
                            );
                        }
                    }
                }
            )();

            return () => {
                cancelled =
                    true;
            };
        },
        [
            active,
            externalWallet.family,
        ],
    );

    useEffect(
        () => {
            if (
                !active ||
                !externalWallet.address ||
                walletCompatibleSourceAssets.length ===
                    0
            ) {
                return;
            }

            let cancelled =
                false;

            const externalAddress =
                externalWallet.address;

            void (
                async () => {
                    setSourceAssetBalancesLoading(
                        true,
                    );

                    try {
                        const balances =
                            await readFundingAssetBalances(
                                externalAddress,
                                walletCompatibleSourceAssets,
                                readSolanaFundingBalances,
                            );

                        if (
                            cancelled
                        ) {
                            return;
                        }

                        setSourceAssetBalances(
                            new Map(
                                balances.map(
                                    (
                                        result,
                                    ) => [
                                        result.assetId,
                                        result.balance,
                                    ],
                                ),
                            ),
                        );
                    } catch (
                        error
                    ) {
                        diagnostics.warn(
                            "funding.asset_balances_failed",
                            error,
                        );

                        if (
                            !cancelled
                        ) {
                            setSourceAssetBalances(
                                new Map(),
                            );
                        }
                    } finally {
                        if (
                            !cancelled
                        ) {
                            setSourceAssetBalancesLoading(
                                false,
                            );
                        }
                    }
                }
            )();

            return () => {
                cancelled =
                    true;
            };
        },
        [
            active,
            externalWallet.address,
            readSolanaFundingBalances,
            walletCompatibleSourceAssets,
        ],
    );

    const changeSourceNetwork =
        useCallback(
            async (
                blockchain:
                    string,
            ) => {
                if (
                    !externalWallet.address ||
                    switchingSourceNetwork
                ) {
                    return;
                }

                invalidatePreview();

                setSourceNetworkError(
                    null,
                );

                setSwitchingSourceNetwork(
                    true,
                );

                try {
                    if (
                        externalWallet.family ===
                            "sol"
                    ) {
                        if (
                            blockchain !==
                                "sol"
                        ) {
                            throw new Error(
                                "Choose an EVM wallet to use that network.",
                            );
                        }
                    } else {
                        const provider =
                            await externalWallet
                                .getEvmProvider();

                        if (
                            !provider
                        ) {
                            throw new Error(
                                "Connected wallet provider is unavailable.",
                            );
                        }

                        await switchToFundingChain(
                            provider,
                            blockchain,
                        );
                    }

                    setSourceBlockchain(
                        blockchain,
                    );

                    const firstAsset =
                        sourceAssets.find(
                            (
                                asset,
                            ) =>
                                asset.blockchain ===
                                    blockchain,
                        );

                    setSourceAssetId(
                        firstAsset?.assetId ??
                            null,
                    );

                    clearAmount();
                } catch (
                    error
                ) {
                    diagnostics.warn(
                        "funding.source_network_switch_failed",
                        error,
                    );

                    setSourceNetworkError(
                        error instanceof
                            Error
                            ? error.message
                            : "We couldn't switch networks.",
                    );
                } finally {
                    setSwitchingSourceNetwork(
                        false,
                    );
                }
            },
            [
                clearAmount,
                externalWallet,
                invalidatePreview,
                sourceAssets,
                switchingSourceNetwork,
            ],
        );

    const selectSourceAsset =
        useCallback(
            (
                assetId:
                    string,
            ) => {
                setSourceAssetId(
                    assetId,
                );
            },
            [],
        );

    const resetSource =
        useCallback(
            () => {
                setDestinationAsset(
                    null,
                );

                setSourceAssets(
                    [],
                );

                setSourceAssetId(
                    null,
                );

                setSourceAssetsLoading(
                    false,
                );

                setSourceAssetsError(
                    null,
                );
            },
            [],
        );

    return {
        destinationAsset,
        sourceBlockchain,
        switchingSourceNetwork,
        sourceNetworkError,
        sourceAssets,
        sourceAssetId,
        sourceAsset,
        sourceAssetBalances,
        sourceAssetBalancesLoading,
        sourceAssetsLoading,
        sourceAssetsError,
        availableSourceBlockchains,
        filteredSourceAssets,
        changeSourceNetwork,
        selectSourceAsset,
        resetSource,
    };
}
