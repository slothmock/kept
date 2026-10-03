import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";

import {
    ArrowLeft,
    ArrowRight,
    Landmark,
    WalletCards,
} from "lucide-react";

import {
    formatUnits,
    parseUnits,
} from "viem";

import {
    useKeptEvmWallet,
    type EthereumProvider,
} from "@/chain/evm-wallet";

import {
    Button,
} from "@/components/ui/button";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

import {
    Input,
} from "@/components/ui/input";

import {
    readBaseUsdcBalance,
} from "@/features/funding/base-usdc";

import {
    executeKeptFunding,
} from "@/features/funding/execute-funding";

import {
    BASE_USDC,
} from "@/features/funding/intents/kept-funding-recipe";

import {
    previewKeptFunding,
} from "@/features/funding/intents/preview-funding";

import {
    createKeptIntentsRunner,
} from "@/features/funding/intents/runner";

import {
    resolveKeptFundingAssets,
    type FundingAsset,
} from "@/features/funding/intents/supported-tokens";

import {
    PrivyFundingButton,
} from "@/features/funding/PrivyFundingButton";

import {
    waitForBaseUsdcIncrease,
} from "@/features/funding/reconcile-base-usdc";

import {
    diagnostics,
} from "@/lib/diagnostics";

import {
    fundingTransferErrorMessage,
} from "@/features/funding/funding-transfer-error";

import {
    FundingAssetPicker,
    FormatFundingChainName,
} from "@/features/funding/FundingAssetPicker";

import {
    readFundingAssetBalances,
} from "@/features/funding/intents/funding-asset-balances";

import {
    useExternalFundingWallet,
    type ExternalFundingWalletOption,
} from "@/features/funding/use-external-funding-wallet";

const BASE_CHAIN =
    "eip155:8453" as const;

const MIN_FIAT_ONRAMP =
    20;

const SOURCE_NETWORK_ORDER =
    [
        "eth",
        "base",
        "arb",
        "op",
        "sol",
    ] as const;

interface EvmFundingChain {
    readonly id:
    number;

    readonly name:
    string;

    readonly nativeCurrency: {
        readonly name:
        string;

        readonly symbol:
        string;

        readonly decimals:
        number;
    };

    readonly rpcUrls:
    readonly string[];

    readonly blockExplorerUrls:
    readonly string[];
}

const EVM_FUNDING_CHAINS:
    Readonly<
        Record<
            string,
            EvmFundingChain
        >
    > = {
    ethereum: {
        id: 1,
        name: "Ethereum",
        nativeCurrency: {
            name: "Ether",
            symbol: "ETH",
            decimals: 18,
        },
        rpcUrls: [
            "https://ethereum-rpc.publicnode.com",
        ],
        blockExplorerUrls: [
            "https://etherscan.io",
        ],
    },

    eth: {
        id: 1,
        name: "Ethereum",
        nativeCurrency: {
            name: "Ether",
            symbol: "ETH",
            decimals: 18,
        },
        rpcUrls: [
            "https://ethereum-rpc.publicnode.com",
        ],
        blockExplorerUrls: [
            "https://etherscan.io",
        ],
    },

    optimism: {
        id: 10,
        name: "Optimism",
        nativeCurrency: {
            name: "Ether",
            symbol: "ETH",
            decimals: 18,
        },
        rpcUrls: [
            "https://mainnet.optimism.io",
        ],
        blockExplorerUrls: [
            "https://optimistic.etherscan.io",
        ],
    },

    op: {
        id: 10,
        name: "Optimism",
        nativeCurrency: {
            name: "Ether",
            symbol: "ETH",
            decimals: 18,
        },
        rpcUrls: [
            "https://mainnet.optimism.io",
        ],
        blockExplorerUrls: [
            "https://optimistic.etherscan.io",
        ],
    },

    base: {
        id: 8453,
        name: "Base",
        nativeCurrency: {
            name: "Ether",
            symbol: "ETH",
            decimals: 18,
        },
        rpcUrls: [
            "https://mainnet.base.org",
        ],
        blockExplorerUrls: [
            "https://basescan.org",
        ],
    },

    arbitrum: {
        id: 42161,
        name: "Arbitrum",
        nativeCurrency: {
            name: "Ether",
            symbol: "ETH",
            decimals: 18,
        },
        rpcUrls: [
            "https://arb1.arbitrum.io/rpc",
        ],
        blockExplorerUrls: [
            "https://arbiscan.io",
        ],
    },

    arb: {
        id: 42161,
        name: "Arbitrum",
        nativeCurrency: {
            name: "Ether",
            symbol: "ETH",
            decimals: 18,
        },
        rpcUrls: [
            "https://arb1.arbitrum.io/rpc",
        ],
        blockExplorerUrls: [
            "https://arbiscan.io",
        ],
    },
};

async function readChainId(
    provider: EthereumProvider,
): Promise<number> {
    const rawChainId =
        await provider.request({
            method:
                "eth_chainId",
        });

    if (
        typeof rawChainId !==
        "string"
    ) {
        throw new Error(
            "Unable to read wallet network.",
        );
    }

    const chainId =
        Number.parseInt(
            rawChainId,
            16,
        );

    if (
        !Number.isSafeInteger(
            chainId,
        )
    ) {
        throw new Error(
            "Unable to read wallet network.",
        );
    }

    return chainId;
}

async function switchToFundingChain(
    provider: EthereumProvider,
    blockchain: string,
): Promise<void> {
    const chain =
        EVM_FUNDING_CHAINS[
        blockchain
        ];

    if (
        !chain
    ) {
        throw new Error(
            `${blockchain} isn't currently supported for wallet transfers.`,
        );
    }

    const currentChainId =
        await readChainId(
            provider,
        );

    if (
        currentChainId ===
        chain.id
    ) {
        return;
    }

    const chainId =
        `0x${chain.id.toString(
            16,
        )}`;

    try {
        await provider.request({
            method:
                "wallet_switchEthereumChain",

            params: [
                {
                    chainId,
                },
            ],
        });
    } catch (error) {
        const code =
            typeof error ===
                "object" &&
                error !==
                null &&
                "code" in
                error
                ? error.code
                : undefined;

        if (
            code !==
            4902
        ) {
            throw error;
        }

        await provider.request({
            method:
                "wallet_addEthereumChain",

            params: [
                {
                    chainId,

                    chainName:
                        chain.name,

                    nativeCurrency:
                        chain.nativeCurrency,

                    rpcUrls: [
                        ...chain.rpcUrls,
                    ],

                    blockExplorerUrls: [
                        ...chain.blockExplorerUrls,
                    ],
                },
            ],
        });
    }
}

async function restoreChain(
    provider: EthereumProvider,
    chainId: number,
): Promise<void> {
    const currentChainId =
        await readChainId(
            provider,
        );

    if (
        currentChainId ===
        chainId
    ) {
        return;
    }

    await provider.request({
        method:
            "wallet_switchEthereumChain",

        params: [
            {
                chainId:
                    `0x${chainId.toString(
                        16,
                    )}`,
            },
        ],
    });
}

type FundingView =
    | "choose"
    | "crypto";

interface FundingPreviewDetails {
    readonly amountIn:
    string;

    readonly amountOut:
    string;

    readonly minimumAmountOut:
    string;

    readonly networkFee:
    string | null;

    readonly estimatedTime:
    string | null;

    readonly depositAddress:
    string;

    readonly intermediaryAddress:
    string;
}

interface AddFundsDialogProps {
    readonly open:
    boolean;

    readonly walletAddress:
    string | null;

    readonly readSolanaFundingBalances:
    (
        owner: string,
    ) => Promise<{
        readonly nativeBalance: string;
        readonly balances: Readonly<Record<string, string>>;
    }>;

    readonly onOpenChange: (
        open: boolean,
    ) => void;

    readonly onUseAvailableCash:
    () => void;
}

export function AddFundsDialog({
    open,
    walletAddress,
    readSolanaFundingBalances,
    onOpenChange,
    onUseAvailableCash,
}: AddFundsDialogProps) {
    const [
        view,
        setView,
    ] =
        useState<FundingView>(
            "choose",
        );

    const [
        cryptoAmount,
        setCryptoAmount,
    ] =
        useState("");

    const [
        previewing,
        setPreviewing,
    ] =
        useState(false);

    const [
        previewStatus,
        setPreviewStatus,
    ] =
        useState<
            string | null
        >(null);

    const [
        previewError,
        setPreviewError,
    ] =
        useState<
            string | null
        >(null);

    const [
        fiatStartingBalance,
        setFiatStartingBalance,
    ] =
        useState<
            bigint | null
        >(null);

    const [
        fiatStatus,
        setFiatStatus,
    ] =
        useState<
            string | null
        >(null);

    const [
        fiatError,
        setFiatError,
    ] =
        useState<
            string | null
        >(null);

    const [
        executing,
        setExecuting,
    ] =
        useState(false);

    const [
        executionStatus,
        setExecutionStatus,
    ] =
        useState<
            string | null
        >(null);

    const [
        executionError,
        setExecutionError,
    ] =
        useState<
            string | null
        >(null);

    const [
        previewedCryptoAmount,
        setPreviewedCryptoAmount,
    ] =
        useState<
            bigint | null
        >(null);

    const [
        previewDetails,
        setPreviewDetails,
    ] =
        useState<
            FundingPreviewDetails | null
        >(null);

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
        useState(
            false,
        );

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



    const wallet =
        useKeptEvmWallet();

    const externalWallet =
        useExternalFundingWallet();

    const sourceAsset =
        useMemo(
            () => {
                if (
                    !sourceAssetId
                ) {
                    return null;
                }

                return (
                    sourceAssets.find(
                        (
                            asset,
                        ) =>
                            asset.assetId ===
                            sourceAssetId,
                    ) ??
                    null
                );
            },
            [
                sourceAssetId,
                sourceAssets,
            ],
        );

    const walletCompatibleSourceAssets =
        useMemo(
            () => {
                return sourceAssets.filter(
                    (
                        asset,
                    ) => {
                        if (
                            !SOURCE_NETWORK_ORDER.includes(
                                asset.blockchain as typeof SOURCE_NETWORK_ORDER[number],
                            )
                        ) {
                            return false;
                        }

                        if (
                            externalWallet.family ===
                            "sol"
                        ) {
                            return asset.blockchain ===
                                "sol";
                        }

                        if (
                            externalWallet.family ===
                            "evm"
                        ) {
                            return asset.blockchain !==
                                "sol";
                        }

                        return true;
                    },
                );
            },
            [
                externalWallet.family,
                sourceAssets,
            ],
        );

    const availableSourceBlockchains =
        useMemo(
            () =>
                SOURCE_NETWORK_ORDER.filter(
                    (
                        blockchain,
                    ) =>
                        walletCompatibleSourceAssets.some(
                            (
                                asset,
                            ) =>
                                asset.blockchain ===
                                blockchain,
                        ),
                ),
            [
                walletCompatibleSourceAssets,
            ],
        );

    const filteredSourceAssets =
        useMemo(
            () => {
                if (
                    !sourceBlockchain
                ) {
                    return [];
                }

                return walletCompatibleSourceAssets.filter(
                    (
                        asset,
                    ) =>
                        asset.blockchain ===
                        sourceBlockchain,
                );
            },
            [
                sourceBlockchain,
                walletCompatibleSourceAssets,
            ],
        );

    useEffect(
        () => {
            if (
                !open ||
                view !==
                "crypto"
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
                            ) => {
                                if (
                                    current &&
                                    origins.some(
                                        (
                                            asset,
                                        ) =>
                                            asset.blockchain ===
                                            current,
                                    ) &&
                                    (
                                        externalWallet.family ===
                                            "sol"
                                            ? current ===
                                                "sol"
                                            : externalWallet.family ===
                                                "evm"
                                              ? current !==
                                                "sol"
                                              : true
                                    )
                                ) {
                                    return current;
                                }

                                const preferredAsset =
                                    externalWallet.family ===
                                        "sol"
                                        ? origins.find(
                                            (
                                                asset,
                                            ) =>
                                                asset.blockchain ===
                                                "sol",
                                        )
                                        : origins.find(
                                            (
                                                asset,
                                            ) =>
                                                asset.blockchain ===
                                                "base",
                                        );

                                return (
                                    preferredAsset?.blockchain ??
                                    origins[0]?.blockchain ??
                                    null
                                );
                            },
                        );

                        setSourceAssetId(
                            (
                                current,
                            ) => {
                                if (
                                    current
                                ) {
                                    const currentAsset =
                                        origins.find(
                                            (
                                                asset,
                                            ) =>
                                                asset.assetId ===
                                                current,
                                        );

                                    if (
                                        currentAsset &&
                                        (
                                            externalWallet.family ===
                                                "sol"
                                                ? currentAsset.blockchain ===
                                                    "sol"
                                                : externalWallet.family ===
                                                    "evm"
                                                  ? currentAsset.blockchain !==
                                                    "sol"
                                                  : true
                                        )
                                    ) {
                                        return current;
                                    }
                                }

                                const preferredUsdc =
                                    origins.find(
                                        (
                                            asset,
                                        ) =>
                                            asset.blockchain ===
                                            (
                                                externalWallet.family ===
                                                    "sol"
                                                    ? "sol"
                                                    : "base"
                                            ) &&
                                            asset.symbol ===
                                            "USDC",
                                    );

                                return (
                                    preferredUsdc
                                        ?.assetId ??
                                    origins[0]
                                        ?.assetId ??
                                    null
                                );
                            },
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
            externalWallet.family,
            open,
            view,
        ],
    );

    useEffect(
        () => {
            if (
                !open ||
                view !==
                "crypto" ||
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
            open,
            view,
            externalWallet.address,
            walletCompatibleSourceAssets,
            readSolanaFundingBalances,
        ],
    );


    const resetDialogState =
        useCallback(
            () => {
                setView(
                    "choose",
                );

                setCryptoAmount(
                    "",
                );

                setPreviewStatus(
                    null,
                );

                setPreviewError(
                    null,
                );

                setPreviewedCryptoAmount(
                    null,
                );

                setPreviewDetails(
                    null,
                );

                setDestinationAsset(
                    null,
                );

                setFiatStartingBalance(
                    null,
                );

                setFiatStatus(
                    null,
                );

                setFiatError(
                    null,
                );

                setExecuting(
                    false,
                );

                setExecutionStatus(
                    null,
                );

                setExecutionError(
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

    const invalidateCryptoPreview =
        useCallback(
            () => {
                setPreviewedCryptoAmount(
                    null,
                );

                setPreviewDetails(
                    null,
                );

                setPreviewStatus(
                    null,
                );

                setPreviewError(
                    null,
                );

                setExecutionStatus(
                    null,
                );

                setExecutionError(
                    null,
                );
            },
            [],
        );

    const handleOpenChange =
        useCallback(
            (
                nextOpen:
                    boolean,
            ) => {
                if (
                    !nextOpen
                ) {
                    resetDialogState();
                }

                onOpenChange(
                    nextOpen,
                );
            },
            [
                onOpenChange,
                resetDialogState,
            ],
        );

    const handleUseAvailableCash =
        useCallback(
            () => {
                onOpenChange(
                    false,
                );

                onUseAvailableCash();
            },
            [
                onOpenChange,
                onUseAvailableCash,
            ],
        );

    const handleFiatStarted =
        useCallback(
            async () => {
                if (
                    !walletAddress
                ) {
                    throw new Error(
                        "Your Kept account isn't ready yet.",
                    );
                }

                setFiatStatus(
                    "Preparing your purchase…",
                );

                setFiatError(
                    null,
                );

                setFiatStartingBalance(
                    null,
                );

                const balance =
                    await readBaseUsdcBalance(
                        walletAddress as `0x${string}`,
                    );

                setFiatStartingBalance(
                    balance,
                );

                diagnostics.info(
                    "funding.privy_starting_balance",
                    {
                        amount:
                            balance.toString(),
                    },
                );

                setFiatStatus(
                    "Waiting for your purchase…",
                );
            },
            [
                walletAddress,
            ],
        );

    const handleFiatError =
        useCallback(
            (
                message:
                    string,
            ) => {
                setFiatStatus(
                    null,
                );

                setFiatStartingBalance(
                    null,
                );

                setFiatError(
                    message || null,
                );
            },
            [],
        );

    const handleSourceNetworkChange =
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

                invalidateCryptoPreview();

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

                    setCryptoAmount(
                        "",
                    );
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
                externalWallet,
                invalidateCryptoPreview,
                sourceAssets,
                switchingSourceNetwork,
            ],
        );

    const executeEmbeddedFunding =
        useCallback(
            async (
                amount: bigint,
            ): Promise<boolean> => {
                if (
                    !walletAddress ||
                    !wallet.address ||
                    executing
                ) {
                    return false;
                }

                setExecuting(
                    true,
                );

                setExecutionStatus(
                    "Moving your money into Kept…",
                );

                setExecutionError(
                    null,
                );

                try {
                    const {
                        origins,
                    } =
                        await resolveKeptFundingAssets();

                    const fiatSourceAsset =
                        origins.find(
                            (
                                asset,
                            ) =>
                                asset.blockchain ===
                                "base" &&
                                asset.symbol ===
                                "USDC",
                        );

                    if (
                        !fiatSourceAsset
                    ) {
                        throw new Error(
                            "Base USDC is not currently supported by Aurora Intents.",
                        );
                    }

                    const provider =
                        await wallet
                            .getProvider();

                    if (
                        !provider
                    ) {
                        throw new Error(
                            "Wallet provider is unavailable.",
                        );
                    }

                    const previousChainId =
                        await readChainId(
                            provider,
                        );

                    await switchToFundingChain(
                        provider,
                        "base",
                    );

                    const runner =
                        createKeptIntentsRunner({
                            sourceAddress:
                                wallet.address,

                            family:
                                "evm",

                            provider,
                        });

                    try {
                        await executeKeptFunding({
                            runner,

                            amount,

                            walletAddress,

                            sourceAsset:
                                fiatSourceAsset,
                        });

                        setExecutionStatus(
                            "Your money has been added to Kept.",
                        );

                        diagnostics.info(
                            "funding.intents_user_complete",
                            {
                                amount:
                                    amount.toString(),
                            },
                        );

                        return true;
                    } finally {
                        runner.dispose();

                        try {
                            await restoreChain(
                                provider,
                                previousChainId,
                            );
                        } catch (restoreError) {
                            diagnostics.warn(
                                "funding.wallet_network_restore_failed",
                                restoreError,
                            );
                        }
                    }
                } catch (
                error
                ) {
                    diagnostics.error(
                        "funding.intents_user_failed",
                        error,
                    );

                    setExecutionStatus(
                        null,
                    );

                    setExecutionError(
                        error instanceof
                            Error
                            ? error.message
                            : "We couldn't finish adding your money.",
                    );

                    return false;
                } finally {
                    setExecuting(
                        false,
                    );
                }
            },
            [
                executing,
                wallet,
                walletAddress,
            ],
        );

    const executeExternalFunding =
        useCallback(
            async (
                amount: bigint,
            ): Promise<boolean> => {
                if (
                    !walletAddress ||
                    !externalWallet.address ||
                    !sourceAsset ||
                    executing
                ) {
                    return false;
                }

                setExecuting(
                    true,
                );

                setExecutionStatus(
                    "Waiting for your wallet…",
                );

                setExecutionError(
                    null,
                );

                try {
                    const family =
                        externalWallet.family;

                    if (
                        !family
                    ) {
                        throw new Error(
                            "Connect a wallet to continue.",
                        );
                    }

                    const evmProvider =
                        family === "evm"
                            ? await externalWallet
                                .getEvmProvider()
                            : null;

                    const solanaProvider =
                        family === "sol"
                            ? await externalWallet
                                .getSolanaProvider()
                            : null;

                    if (
                        family === "evm" &&
                        !evmProvider
                    ) {
                        throw new Error(
                            "Connected wallet provider is unavailable.",
                        );
                    }

                    if (
                        family === "sol" &&
                        !solanaProvider
                    ) {
                        throw new Error(
                            "Connected Solana wallet provider is unavailable.",
                        );
                    }

                    const previousChainId =
                        evmProvider
                            ? await readChainId(
                                evmProvider,
                            )
                            : null;

                    if (
                        evmProvider
                    ) {
                        await switchToFundingChain(
                            evmProvider,
                            sourceAsset.blockchain,
                        );
                    }

                    const runner =
                        family === "sol"
                            ? createKeptIntentsRunner({
                                sourceAddress:
                                    externalWallet.address,

                                family:
                                    "sol",

                                provider:
                                    solanaProvider!,
                            })
                            : createKeptIntentsRunner({
                                sourceAddress:
                                    externalWallet.address,

                                family:
                                    "evm",

                                provider:
                                    evmProvider!,
                            });

                    try {
                        await executeKeptFunding({
                            runner,

                            amount,

                            walletAddress,

                            sourceAsset,
                        });

                        setExecutionStatus(
                            "Your money has been added to Kept.",
                        );

                        diagnostics.info(
                            "funding.external_intents_complete",
                            {
                                amount:
                                    amount.toString(),

                                sourceAsset:
                                    sourceAsset.symbol,

                                sourceChain:
                                    sourceAsset.blockchain,
                            },
                        );

                        return true;
                    } finally {
                        runner.dispose();

                        if (
                            evmProvider &&
                            previousChainId !== null
                        ) {
                            try {
                                await restoreChain(
                                    evmProvider,
                                    previousChainId,
                                );
                            } catch (restoreError) {
                                diagnostics.warn(
                                    "funding.external_wallet_network_restore_failed",
                                    restoreError,
                                );
                            }
                        }
                    }
                } catch (
                error
                ) {
                    diagnostics.error(
                        "funding.external_intents_failed",
                        error,
                    );

                    setExecutionStatus(
                        null,
                    );

                    setExecutionError(
                        fundingTransferErrorMessage(
                            error,
                            sourceAsset,
                            "We couldn't prepare your transfer.",
                        ),
                    );

                    return false;
                } finally {
                    setExecuting(
                        false,
                    );
                }
            },
            [
                executing,
                externalWallet,
                sourceAsset,
                walletAddress,
            ],
        );

    const handleFiatConfirmed =
        useCallback(
            async () => {
                if (
                    !walletAddress
                ) {
                    setFiatError(
                        "Your Kept account isn't ready yet.",
                    );

                    return;
                }

                if (
                    fiatStartingBalance ===
                    null
                ) {
                    setFiatError(
                        "We couldn't determine how much was added.",
                    );

                    return;
                }

                setFiatError(
                    null,
                );

                setFiatStatus(
                    "Your purchase is confirmed. Waiting for the funds to arrive…",
                );

                try {
                    const received =
                        await waitForBaseUsdcIncrease({
                            address:
                                walletAddress as `0x${string}`,

                            startingBalance:
                                fiatStartingBalance,

                            readBalance:
                                readBaseUsdcBalance,
                        });

                    diagnostics.info(
                        "funding.privy_usdc_received",
                        {
                            amount:
                                received.toString(),
                        },
                    );


                    setFiatStatus(
                        "Your money has arrived. Moving it into Kept…",
                    );

                    const succeeded =
                        await executeEmbeddedFunding(
                            received,
                        );

                    setFiatStatus(
                        null,
                    );

                    if (
                        !succeeded
                    ) {
                        return;
                    }
                } catch (
                error
                ) {
                    diagnostics.error(
                        "funding.privy_reconciliation_failed",
                        error,
                    );

                    setFiatError(
                        error instanceof
                            Error
                            ? error.message
                            : "We couldn't confirm that your money arrived.",
                    );

                    setFiatStatus(
                        null,
                    );
                }
            },
            [
                executeEmbeddedFunding,
                fiatStartingBalance,
                walletAddress,
            ],
        );

    const handlePreviewRoute =
        useCallback(
            async () => {
                if (
                    !walletAddress ||
                    previewing
                ) {
                    return;
                }

                if (
                    !externalWallet.address
                ) {
                    setPreviewError(
                        "Connect a wallet to continue.",
                    );

                    return;
                }

                if (
                    !sourceAsset
                ) {
                    setPreviewError(
                        "Choose a funding option to continue.",
                    );

                    return;
                }

                let amount:
                    bigint;

                try {
                    amount =
                        parseUnits(
                            cryptoAmount,
                            sourceAsset.decimals,
                        );
                } catch {
                    setPreviewError(
                        `Enter a valid ${sourceAsset.symbol} amount.`,
                    );

                    return;
                }

                if (
                    amount <=
                    0n
                ) {
                    setPreviewError(
                        "Enter an amount greater than zero.",
                    );

                    return;
                }

                setPreviewing(
                    true,
                );

                setPreviewStatus(
                    null,
                );

                setPreviewError(
                    null,
                );

                setPreviewedCryptoAmount(
                    null,
                );

                setPreviewDetails(
                    null,
                );

                try {
                    const family =
                        externalWallet.family;

                    if (
                        !family
                    ) {
                        throw new Error(
                            "Connected wallet provider is unavailable.",
                        );
                    }

                    const evmProvider =
                        family === "evm"
                            ? await externalWallet
                                .getEvmProvider()
                            : null;

                    const solanaProvider =
                        family === "sol"
                            ? await externalWallet
                                .getSolanaProvider()
                            : null;

                    if (
                        family === "evm" &&
                        !evmProvider
                    ) {
                        throw new Error(
                            "Connected wallet provider is unavailable.",
                        );
                    }

                    if (
                        family === "sol" &&
                        !solanaProvider
                    ) {
                        throw new Error(
                            "Connected Solana wallet provider is unavailable.",
                        );
                    }

                    const previousChainId =
                        evmProvider
                            ? await readChainId(
                                evmProvider,
                            )
                            : null;

                    if (
                        evmProvider
                    ) {
                        await switchToFundingChain(
                            evmProvider,
                            sourceAsset.blockchain,
                        );
                    }

                    const runner =
                        family === "sol"
                            ? createKeptIntentsRunner({
                                sourceAddress:
                                    externalWallet.address,

                                family:
                                    "sol",

                                provider:
                                    solanaProvider!,
                            })
                            : createKeptIntentsRunner({
                                sourceAddress:
                                    externalWallet.address,

                                family:
                                    "evm",

                                provider:
                                    evmProvider!,
                            });

                    try {
                        const {
                            preview,
                        } =
                            await previewKeptFunding({
                                runner,

                                amount,

                                walletAddress,

                                sourceAsset,
                            });

                        setPreviewedCryptoAmount(
                            amount,
                        );

                        setPreviewDetails({
                            amountIn:
                                preview.execution.quote.amountIn,

                            amountOut:
                                preview.execution.quote.amountOut,

                            minimumAmountOut:
                                preview.execution.quote.minAmountOut,

                            networkFee:
                                preview.execution.details.networkFee ??
                                null,

                            estimatedTime:
                                preview.execution.details.estimatedTime ??
                                null,

                            depositAddress:
                                preview.execution.quote.depositAddress,

                            intermediaryAddress:
                                preview.execution.details.intermediaryAddress,
                        });

                        setExecutionStatus(
                            null,
                        );

                        setExecutionError(
                            null,
                        );


                        setPreviewStatus(
                            "Your transfer route is ready.",
                        );
                    } finally {
                        runner.dispose();

                        if (
                            evmProvider &&
                            previousChainId !== null
                        ) {
                            try {
                                await restoreChain(
                                    evmProvider,
                                    previousChainId,
                                );
                            } catch (restoreError) {
                                diagnostics.warn(
                                    "funding.external_wallet_network_restore_failed",
                                    restoreError,
                                );
                            }
                        }
                    }
                } catch (
                error
                ) {

                    setPreviewedCryptoAmount(
                        null,
                    );

                    setPreviewDetails(
                        null,
                    );

                    setPreviewError(
                        fundingTransferErrorMessage(
                            error,
                            sourceAsset,
                            "We couldn't complete your transfer.",
                        ),
                    );
                } finally {
                    setPreviewing(
                        false,
                    );
                }
            },
            [
                cryptoAmount,
                externalWallet,
                previewing,
                sourceAsset,
                walletAddress,
            ],
        );

    return (
        <Dialog
            open={
                open
            }

            onOpenChange={
                handleOpenChange
            }
        >
            <DialogContent className="sm:max-w-lg">
                {view ===
                    "choose" ? (
                    <FundingChoiceView
                        walletAddress={
                            walletAddress
                        }

                        fiatStatus={
                            fiatStatus
                        }

                        fiatError={
                            fiatError
                        }

                        executionStatus={
                            executionStatus
                        }

                        executionError={
                            executionError
                        }

                        executing={
                            executing
                        }

                        onFiatStarted={
                            handleFiatStarted
                        }

                        onFiatSubmitted={() => {
                            setFiatStatus(
                                "Your purchase is being processed…",
                            );
                        }}

                        onFiatConfirmed={() => {
                            void handleFiatConfirmed();
                        }}

                        onFiatError={handleFiatError}

                        onUseAvailableCash={
                            handleUseAvailableCash
                        }

                        onTransferCrypto={() => {
                            invalidateCryptoPreview();

                            setView(
                                "crypto",
                            );
                        }}
                    />
                ) : (
                    <CryptoFundingView
                        walletAddress={
                            walletAddress
                        }

                        externalWalletConnected={
                            externalWallet.connected
                        }

                        externalWalletAddress={
                            externalWallet.address
                        }

                        externalWalletClientType={
                            externalWallet.walletClientType
                        }

                        externalWalletFamily={
                            externalWallet.family
                        }

                        availableExternalWallets={
                            externalWallet.availableWallets
                        }

                        sourceBlockchains={
                            availableSourceBlockchains
                        }

                        sourceBlockchain={
                            sourceBlockchain
                        }

                        sourceNetworkError={
                            sourceNetworkError
                        }

                        switchingSourceNetwork={
                            switchingSourceNetwork
                        }

                        onSourceNetworkChange={(
                            blockchain,
                        ) => {
                            void handleSourceNetworkChange(
                                blockchain,
                            );
                        }}

                        sourceAssets={
                            filteredSourceAssets
                        }

                        sourceAsset={
                            sourceAsset
                        }

                        destinationAsset={
                            destinationAsset
                        }

                        previewDetails={
                            previewDetails
                        }

                        sourceAssetsLoading={
                            sourceAssetsLoading
                        }

                        sourceAssetsError={
                            sourceAssetsError
                        }

                        sourceAssetBalances={
                            sourceAssetBalances
                        }

                        sourceAssetBalancesLoading={
                            sourceAssetBalancesLoading
                        }

                        amount={
                            cryptoAmount
                        }

                        previewing={
                            previewing
                        }

                        previewStatus={
                            previewStatus
                        }

                        previewError={
                            previewError
                        }

                        executing={
                            executing
                        }

                        executionStatus={
                            executionStatus
                        }

                        executionError={
                            executionError
                        }

                        canExecute={
                            previewedCryptoAmount !==
                            null
                        }

                        onSelectExternalWallet={(address, family) => {
                            invalidateCryptoPreview();

                            externalWallet.select(
                                address,
                                family,
                            );
                        }}

                        onChangeExternalWallet={() => {
                            invalidateCryptoPreview();

                            externalWallet.clearSelection();
                        }}

                        onConnectExternalWallet={(family) => {
                            invalidateCryptoPreview();

                            void externalWallet.connect(
                                family,
                            );
                        }}

                        onSourceAssetChange={(
                            assetId,
                        ) => {
                            invalidateCryptoPreview();

                            setCryptoAmount(
                                "",
                            );

                            setSourceAssetId(
                                assetId,
                            );
                        }}

                        onAmountChange={
                            setCryptoAmount
                        }

                        onPreviewInvalidated={
                            invalidateCryptoPreview
                        }

                        onBack={() => {
                            invalidateCryptoPreview();

                            setView(
                                "choose",
                            );
                        }}

                        onPreviewRoute={() => {
                            void handlePreviewRoute();
                        }}

                        onExecute={() => {
                            if (
                                previewedCryptoAmount ===
                                null
                            ) {
                                return;
                            }

                            void executeExternalFunding(
                                previewedCryptoAmount,
                            );
                        }}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

function FundingChoiceView({
    walletAddress,
    fiatStatus,
    fiatError,
    executionStatus,
    executionError,
    executing,
    onFiatStarted,
    onFiatSubmitted,
    onFiatConfirmed,
    onFiatError,
    onTransferCrypto,
    onUseAvailableCash,
}: {
    readonly walletAddress:
    string | null;

    readonly fiatStatus:
    string | null;

    readonly fiatError:
    string | null;

    readonly executionStatus:
    string | null;

    readonly executionError:
    string | null;

    readonly executing:
    boolean;

    readonly onFiatStarted:
    () => Promise<void>;

    readonly onFiatSubmitted:
    () => void;

    readonly onFiatConfirmed:
    () => void;

    readonly onFiatError: (
        message: string
    ) => void;

    readonly onTransferCrypto:
    () => void;

    readonly onUseAvailableCash:
    () => void;
}) {
    return (
        <div className="space-y-4">
            <DialogHeader>
                <DialogTitle>
                    Add money
                </DialogTitle>

                <DialogDescription>
                    Choose how you'd like
                    to add money to Kept.
                </DialogDescription>
            </DialogHeader>

            <FundingOption
                icon={
                    <Landmark className="size-5" />
                }

                title="Buy USDC"

                description="Add new money using card or another supported payment method."
            >
                {walletAddress ? (
                    <PrivyFundingButton
                        address={
                            walletAddress
                        }

                        asset={
                            BASE_USDC
                        }

                        chain={
                            BASE_CHAIN
                        }

                        defaultAmount={
                            String(
                                MIN_FIAT_ONRAMP,
                            )
                        }

                        onStarted={
                            onFiatStarted
                        }

                        onSubmitted={
                            onFiatSubmitted
                        }

                        onConfirmed={
                            onFiatConfirmed
                        }
                        onError={onFiatError}
                    />
                ) : (
                    <Button
                        className="w-full"
                        disabled
                    >
                        Preparing your account…
                    </Button>
                )}

                {fiatStatus ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                        {
                            fiatStatus
                        }
                    </p>
                ) : null}

                {fiatError ? (
                    <p
                        className="mt-3 text-sm text-destructive"
                        role="alert"
                    >
                        {
                            fiatError
                        }
                    </p>
                ) : null}

                {executionStatus ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                        {
                            executionStatus
                        }
                    </p>
                ) : null}

                {executionError ? (
                    <p
                        className="mt-3 text-sm text-destructive"
                        role="alert"
                    >
                        {
                            executionError
                        }
                    </p>
                ) : null}

                {executing ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                        Keep this window open
                        while Kept finishes
                        adding your money.
                    </p>
                ) : null}
            </FundingOption>

            <FundingOption
                icon={
                    <WalletCards className="size-5" />
                }

                title="Use available cash"

                description="Move money already available in Kept into savings."
            >
                <Button
                    type="button"
                    className="w-full"

                    disabled={
                        executing
                    }

                    onClick={
                        onUseAvailableCash
                    }
                >
                    Deposit available cash
                </Button>
            </FundingOption>

            <FundingOption
                icon={
                    <ArrowRight className="size-5" />
                }

                title="Transfer crypto"

                description="Use crypto you already own in another wallet."
            >
                <Button
                    type="button"
                    className="w-full"

                    disabled={
                        !walletAddress ||
                        executing
                    }

                    onClick={
                        onTransferCrypto
                    }
                >
                    Transfer crypto
                </Button>
            </FundingOption>
        </div>
    );
}

function CryptoFundingView({
    walletAddress,
    externalWalletConnected,
    externalWalletAddress,
    externalWalletClientType,
    externalWalletFamily,
    availableExternalWallets,

    sourceAssets,
    sourceAsset,
    destinationAsset,
    previewDetails,
    sourceAssetsLoading,
    sourceAssetsError,
    sourceAssetBalances,
    sourceAssetBalancesLoading,

    sourceBlockchains,
    sourceBlockchain,
    switchingSourceNetwork,
    sourceNetworkError,

    amount,
    previewing,
    previewStatus,
    previewError,
    executing,
    executionStatus,
    executionError,
    canExecute,

    onConnectExternalWallet,
    onSelectExternalWallet,
    onChangeExternalWallet,
    onSourceAssetChange,
    onSourceNetworkChange,
    onAmountChange,
    onPreviewInvalidated,
    onBack,
    onPreviewRoute,
    onExecute,
}: {
    readonly walletAddress:
    string | null;

    readonly externalWalletConnected:
    boolean;

    readonly externalWalletAddress:
    string | null;

    readonly externalWalletClientType:
    string | null;

    readonly externalWalletFamily:
    "evm" | "sol" | null;

    readonly availableExternalWallets:
    readonly ExternalFundingWalletOption[];

    readonly sourceBlockchains:
    readonly string[];

    readonly sourceBlockchain:
    string | null;

    readonly switchingSourceNetwork:
    boolean;

    readonly sourceNetworkError:
    string | null;

    readonly onSourceNetworkChange: (
        blockchain: string,
    ) => void;

    readonly sourceAssets:
    readonly FundingAsset[];

    readonly sourceAsset:
    FundingAsset | null;

    readonly destinationAsset:
    FundingAsset | null;

    readonly previewDetails:
    FundingPreviewDetails | null;

    readonly sourceAssetsLoading:
    boolean;

    readonly sourceAssetsError:
    string | null;

    readonly sourceAssetBalances:
    ReadonlyMap<
        string,
        bigint | null
    >;

    readonly sourceAssetBalancesLoading:
    boolean;

    readonly amount:
    string;

    readonly previewing:
    boolean;

    readonly previewStatus:
    string | null;

    readonly previewError:
    string | null;

    readonly executing:
    boolean;

    readonly executionStatus:
    string | null;

    readonly executionError:
    string | null;

    readonly canExecute:
    boolean;

    readonly onConnectExternalWallet: (
        family:
            "evm" | "sol",
    ) => void;

    readonly onSelectExternalWallet: (
        address: string,
        family: "evm" | "sol",
    ) => void;

    readonly onChangeExternalWallet:
    () => void;

    readonly onSourceAssetChange: (
        assetId: string,
    ) => void;

    readonly onAmountChange: (
        value: string,
    ) => void;

    readonly onPreviewInvalidated:
    () => void;

    readonly onBack:
    () => void;

    readonly onPreviewRoute:
    () => void;

    readonly onExecute:
    () => void;
}) {
    const [
        walletFamilyChooserOpen,
        setWalletFamilyChooserOpen,
    ] =
        useState(false);

    const [
        previewTab,
        setPreviewTab,
    ] =
        useState<
            "transfer" | "more-info"
        >(
            "transfer",
        );

    useEffect(
        () => {
            setPreviewTab(
                "transfer",
            );
        },
        [
            previewDetails,
        ],
    );

    const connectWalletFamily = (
        family:
            "evm" | "sol",
    ) => {
        setWalletFamilyChooserOpen(
            false,
        );

        onConnectExternalWallet(
            family,
        );
    };

    const shortAddress =
        externalWalletAddress
            ? `${externalWalletAddress.slice(
                0,
                6,
            )}…${externalWalletAddress.slice(
                -4,
            )}`
            : null;


    return (
        <div className="space-y-5">
            <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-ml-2"

                disabled={
                    executing
                }

                onClick={
                    onBack
                }
            >
                <ArrowLeft className="mr-2 size-4" />

                Back
            </Button>

            <DialogHeader>
                <DialogTitle>
                    Transfer crypto
                </DialogTitle>

                <DialogDescription>
                    Move crypto you
                    already own into
                    your Kept account.
                </DialogDescription>
            </DialogHeader>

            <div className="rounded-lg border p-4">
                <p className="text-sm font-medium">
                    Source wallet
                </p>

                {externalWalletConnected ? (
                    <div className="mt-2 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                            <p className="text-sm font-medium capitalize">
                                {externalWalletClientType ??
                                    "External wallet"}
                                {externalWalletFamily === "sol"
                                    ? " · Solana"
                                    : externalWalletFamily === "evm"
                                      ? " · EVM"
                                      : ""}
                            </p>

                            <p className="truncate text-sm text-muted-foreground">
                                {shortAddress}
                            </p>
                        </div>

                        <Button
                            type="button"
                            variant="outline"
                            size="sm"

                            disabled={
                                executing
                            }

                            onClick={
                                onChangeExternalWallet
                            }
                        >
                            Change
                        </Button>
                    </div>
                ) : (
                    <div className="mt-3 space-y-3">
                        {availableExternalWallets.length >
                            0 ? (
                            <>
                                <p className="text-sm text-muted-foreground">
                                    Choose which wallet
                                    you'd like to fund
                                    Kept from.
                                </p>

                                <div className="space-y-2">
                                    {availableExternalWallets.map(
                                        (
                                            wallet,
                                        ) => {
                                            const walletShortAddress =
                                                `${wallet.address.slice(
                                                    0,
                                                    6,
                                                )}…${wallet.address.slice(
                                                    -4,
                                                )}`;

                                            return (
                                                <Button
                                                    key={
                                                        `${wallet.family}:${wallet.walletName}:${wallet.address}`
                                                    }

                                                    type="button"

                                                    variant="outline"

                                                    className="w-full justify-between"

                                                    disabled={
                                                        executing
                                                    }

                                                    onClick={() => {
                                                        onSelectExternalWallet(
                                                            wallet.address,
                                                            wallet.family,
                                                        );
                                                    }}
                                                >
                                                    <span className="capitalize">
                                                        {
                                                            wallet.walletName
                                                        }
                                                    </span>

                                                    <span className="text-muted-foreground">
                                                        {
                                                            walletShortAddress
                                                        }
                                                    </span>
                                                </Button>
                                            );
                                        },
                                    )}
                                </div>
                            </>
                        ) : (
                            <p className="text-sm leading-6 text-muted-foreground">
                                Connect the wallet
                                that holds the crypto
                                you'd like to transfer.
                            </p>
                        )}

                        {walletFamilyChooserOpen ? (
                            <div className="rounded-lg border bg-muted/20 p-3">
                                <p className="mb-2 text-sm font-medium">
                                    Which network does your wallet use?
                                </p>

                                <div className="grid gap-2 sm:grid-cols-2">
                                    <Button
                                        type="button"
                                        className="w-full"

                                        disabled={
                                            executing
                                        }

                                        onClick={() => {
                                            connectWalletFamily(
                                                "sol",
                                            );
                                        }}
                                    >
                                        Solana
                                    </Button>

                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full"

                                        disabled={
                                            executing
                                        }

                                        onClick={() => {
                                            connectWalletFamily(
                                                "evm",
                                            );
                                        }}
                                    >
                                        EVM
                                    </Button>
                                </div>

                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="mt-2 w-full"

                                    disabled={
                                        executing
                                    }

                                    onClick={() => {
                                        setWalletFamilyChooserOpen(
                                            false,
                                        );
                                    }}
                                >
                                    Cancel
                                </Button>
                            </div>
                        ) : (
                            <Button
                                type="button"
                                variant={
                                    availableExternalWallets.length >
                                        0
                                        ? "ghost"
                                        : "default"
                                }
                                className="w-full"

                                disabled={
                                    executing
                                }

                                onClick={() => {
                                    setWalletFamilyChooserOpen(
                                        true,
                                    );
                                }}
                            >
                                Connect wallet
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {externalWalletConnected ? (
                <>
                    <div className="grid gap-4 sm:grid-cols-[0.85fr_1.15fr]">
                        <div className="space-y-2">
                            <label
                                htmlFor="crypto-funding-network"
                                className="text-sm font-medium"
                            >
                                Network
                            </label>

                            <select
                                id="crypto-funding-network"
                                value={
                                    sourceBlockchain ??
                                    ""
                                }
                                disabled={
                                    switchingSourceNetwork ||
                                    previewing ||
                                    executing
                                }
                                onChange={(
                                    event,
                                ) => {
                                    onSourceNetworkChange(
                                        event.target.value,
                                    );
                                }}
                                className="flex h-15 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {sourceBlockchains.map(
                                    (
                                        blockchain,
                                    ) => (
                                        <option
                                            key={
                                                blockchain
                                            }
                                            value={
                                                blockchain
                                            }
                                        >
                                            {
                                                FormatFundingChainName(
                                                    blockchain,
                                                )
                                            }
                                        </option>
                                    ),
                                )}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">
                                Asset
                            </label>

                            {sourceAssetsLoading ? (
                                <div className="flex h-10 items-center rounded-md border px-3 text-sm text-muted-foreground">
                                    Loading assets…
                                </div>
                            ) : sourceAssetsError ? (
                                <div className="flex h-10 items-center rounded-md border border-destructive px-3 text-sm text-destructive">
                                    Couldn't load assets
                                </div>
                            ) : sourceAssets.length > 0 ? (
                                <FundingAssetPicker
                                    assets={
                                        sourceAssets
                                    }
                                    selectedAsset={
                                        sourceAsset
                                    }
                                    balances={
                                        sourceAssetBalances
                                    }
                                    balancesLoading={
                                        sourceAssetBalancesLoading
                                    }
                                    disabled={
                                        switchingSourceNetwork ||
                                        previewing ||
                                        executing
                                    }
                                    onSelect={
                                        onSourceAssetChange
                                    }
                                />
                            ) : (
                                <div className="flex h-10 items-center rounded-md border px-3 text-sm text-muted-foreground">
                                    No supported assets
                                </div>
                            )}
                        </div>
                    </div>

                    {switchingSourceNetwork ? (
                        <p className="text-xs text-muted-foreground">
                            Confirm the network change in your wallet…
                        </p>
                    ) : null}

                    {sourceNetworkError ? (
                        <p
                            className="text-sm text-destructive"
                            role="alert"
                        >
                            {
                                sourceNetworkError
                            }
                        </p>
                    ) : null}

                    {sourceAsset ? (
                        <>
                            <div className="rounded-lg border bg-muted/20 p-4">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="min-w-0">
                                        <p className="font-medium">
                                            {
                                                sourceAsset.symbol
                                            }
                                        </p>

                                        <p className="text-sm text-muted-foreground">
                                            {
                                                FormatFundingChainName(
                                                    sourceAsset.blockchain,
                                                )
                                            }
                                        </p>
                                    </div>

                                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" />

                                    <div className="text-right">
                                        <p className="font-medium">
                                            USDC
                                        </p>

                                        <p className="text-sm text-muted-foreground">
                                            Kept (Monad)
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label
                                    htmlFor="crypto-funding-amount"
                                    className="text-sm font-medium"
                                >
                                    Amount
                                </label>

                                <div className="relative">
                                    <Input
                                        id="crypto-funding-amount"

                                        inputMode="decimal"

                                        placeholder="0.00"

                                        value={
                                            amount
                                        }

                                        disabled={
                                            previewing ||
                                            executing
                                        }

                                        onChange={(
                                            event,
                                        ) => {
                                            onAmountChange(
                                                event.target.value,
                                            );

                                            onPreviewInvalidated();
                                        }}
                                    />

                                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                                        {
                                            sourceAsset.symbol
                                        }
                                    </span>
                                </div>
                            </div>

                            {!canExecute ? (
                                <Button
                                    type="button"
                                    className="w-full"

                                    disabled={
                                        !walletAddress ||
                                        !externalWalletConnected ||
                                        previewing ||
                                        executing ||
                                        amount
                                            .trim()
                                            .length ===
                                        0
                                    }

                                    onClick={
                                        onPreviewRoute
                                    }
                                >
                                    {previewing
                                        ? "Checking transfer…"
                                        : "Continue"}
                                </Button>
                            ) : null}

                            {previewStatus &&
                            previewDetails &&
                            destinationAsset ? (
                                <div className="overflow-hidden rounded-lg border bg-muted/20">
                                    <div
                                        className="grid grid-cols-2 border-b p-1"
                                        role="tablist"
                                        aria-label="Transfer preview details"
                                    >
                                        <button
                                            type="button"
                                            role="tab"
                                            aria-selected={
                                                previewTab ===
                                                "transfer"
                                            }
                                            className={
                                                previewTab ===
                                                "transfer"
                                                    ? "rounded-md bg-background px-3 py-2 text-sm font-medium shadow-sm"
                                                    : "rounded-md px-3 py-2 text-sm text-muted-foreground"
                                            }
                                            onClick={() => {
                                                setPreviewTab(
                                                    "transfer",
                                                );
                                            }}
                                        >
                                            Transfer
                                        </button>

                                        <button
                                            type="button"
                                            role="tab"
                                            aria-selected={
                                                previewTab ===
                                                "more-info"
                                            }
                                            className={
                                                previewTab ===
                                                "more-info"
                                                    ? "rounded-md bg-background px-3 py-2 text-sm font-medium shadow-sm"
                                                    : "rounded-md px-3 py-2 text-sm text-muted-foreground"
                                            }
                                            onClick={() => {
                                                setPreviewTab(
                                                    "more-info",
                                                );
                                            }}
                                        >
                                            More info
                                        </button>
                                    </div>

                                    {previewTab ===
                                    "transfer" ? (
                                        <div
                                            className="space-y-4 p-4"
                                            role="tabpanel"
                                        >
                                            <div>
                                                <p className="text-xs text-muted-foreground">
                                                    You're adding
                                                </p>

                                                <p className="mt-1 text-lg font-semibold">
                                                    {
                                                        amount
                                                    }{" "}
                                                    {
                                                        sourceAsset.symbol
                                                    }
                                                </p>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <p className="text-xs text-muted-foreground">
                                                        From
                                                    </p>

                                                    <p className="mt-1 text-sm font-medium">
                                                        {
                                                            FormatFundingChainName(
                                                                sourceAsset.blockchain,
                                                            )
                                                        }
                                                    </p>
                                                </div>

                                                <div className="text-right">
                                                    <p className="text-xs text-muted-foreground">
                                                        Kept receives at least
                                                    </p>

                                                    <p className="mt-1 text-sm font-medium">
                                                        {
                                                            formatUnits(
                                                                BigInt(
                                                                    previewDetails.minimumAmountOut,
                                                                ),
                                                                destinationAsset.decimals,
                                                            )
                                                        }{" "}
                                                        {
                                                            destinationAsset.symbol
                                                        }
                                                    </p>
                                                </div>
                                            </div>

                                            {previewDetails.estimatedTime ? (
                                                <div className="flex items-center justify-between gap-4 border-t pt-3 text-sm">
                                                    <span className="text-muted-foreground">
                                                        Estimated time
                                                    </span>

                                                    <span className="font-medium">
                                                        {
                                                            previewDetails.estimatedTime
                                                        }
                                                    </span>
                                                </div>
                                            ) : null}
                                        </div>
                                    ) : (
                                        <div
                                            className="space-y-3 p-4 text-sm"
                                            role="tabpanel"
                                        >
                                            <PreviewDetailRow
                                                label="Source asset"
                                                value={`${sourceAsset.symbol} on ${FormatFundingChainName(
                                                    sourceAsset.blockchain,
                                                )}`}
                                            />

                                            <PreviewDetailRow
                                                label="Destination"
                                                value={`${destinationAsset.symbol} in Kept`}
                                            />

                                            <PreviewDetailRow
                                                label="Expected amount"
                                                value={`${formatUnits(
                                                    BigInt(
                                                        previewDetails.amountOut,
                                                    ),
                                                    destinationAsset.decimals,
                                                )} ${destinationAsset.symbol}`}
                                            />

                                            <PreviewDetailRow
                                                label="Minimum received"
                                                value={`${formatUnits(
                                                    BigInt(
                                                        previewDetails.minimumAmountOut,
                                                    ),
                                                    destinationAsset.decimals,
                                                )} ${destinationAsset.symbol}`}
                                            />

                                            {previewDetails.networkFee ? (
                                                <PreviewDetailRow
                                                    label="Provider fee"
                                                    value={`${formatUnits(
                                                        BigInt(
                                                            previewDetails.networkFee,
                                                        ),
                                                        destinationAsset.decimals,
                                                    )} ${destinationAsset.symbol}`}
                                                />
                                            ) : null}

                                            <PreviewDetailRow
                                                label="Slippage tolerance"
                                                value="1%"
                                            />

                                            <PreviewDetailRow
                                                label="Source wallet"
                                                value={
                                                    shortAddress ??
                                                    "Connected wallet"
                                                }
                                            />

                                            <PreviewDetailRow
                                                label="Destination network"
                                                value={
                                                    FormatFundingChainName(
                                                        destinationAsset.blockchain,
                                                    )
                                                }
                                            />
                                        </div>
                                    )}
                                </div>
                            ) : null}

                            {previewError ? (
                                <p
                                    className="text-sm text-destructive"
                                    role="alert"
                                >
                                    {
                                        previewError
                                    }
                                </p>
                            ) : null}

                            {canExecute ? (
                                <Button
                                    type="button"
                                    className="w-full"

                                    disabled={
                                        executing ||
                                        !externalWalletConnected
                                    }

                                    onClick={
                                        onExecute
                                    }
                                >
                                    {executing
                                        ? "Adding money…"
                                        : "Confirm transfer"}
                                </Button>
                            ) : null}

                            {executionStatus ? (
                                <div className="rounded-lg border bg-muted/20 p-3">
                                    <p className="text-sm">
                                        {
                                            executionStatus
                                        }
                                    </p>
                                </div>
                            ) : null}

                            {executionError ? (
                                <p
                                    className="text-sm text-destructive"
                                    role="alert"
                                >
                                    {
                                        executionError
                                    }
                                </p>
                            ) : null}

                            <p className="text-xs leading-5 text-muted-foreground">
                                Kept converts the selected asset to USDC during
                                the transfer.<br />
                                Network and provider fees may apply.
                            </p>
                        </>
                    ) : null}
                </>
            ) : null}
        </div>
    );
}

function PreviewDetailRow({
    label,
    value,
}: {
    readonly label:
    string;

    readonly value:
    string;
}) {
    return (
        <div className="flex items-start justify-between gap-4">
            <span className="text-muted-foreground">
                {
                    label
                }
            </span>

            <span className="max-w-[60%] break-all text-right font-medium">
                {
                    value
                }
            </span>
        </div>
    );
}

function FundingOption({
    icon,
    title,
    description,
    children,
}: {
    readonly icon:
    ReactNode;

    readonly title:
    string;

    readonly description:
    string;

    readonly children:
    ReactNode;
}) {
    return (
        <div className="rounded-lg border p-4">
            <div className="flex gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-muted">
                    {
                        icon
                    }
                </div>

                <div>
                    <p className="font-medium">
                        {
                            title
                        }
                    </p>

                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {
                            description
                        }
                    </p>
                </div>
            </div>

            <div className="mt-4">
                {
                    children
                }
            </div>
        </div>
    );
}