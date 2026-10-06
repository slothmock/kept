import {
    useCallback,
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
} from "viem";

import {
    useKeptEvmWallet,
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
    BASE_USDC,
} from "@/features/funding/intents/kept-funding-recipe";

import type {
    FundingAsset,
} from "@/features/funding/intents/supported-tokens";

import {
    PrivyFundingButton,
} from "@/features/funding/PrivyFundingButton";

import {
    FundingAssetPicker,
    FormatFundingChainName,
} from "@/features/funding/FundingAssetPicker";

import {
    useExternalFundingWallet,
    type ExternalFundingWalletOption,
} from "@/features/funding/use-external-funding-wallet";

import {
    useFundingSourceController,
} from "@/features/funding/use-funding-source-controller";

import {
    useFundingPreviewController,
    type FundingPreviewDetails,
} from "@/features/funding/use-funding-preview-controller";

import {
    useFundingExecutionController,
} from "@/features/funding/use-funding-execution-controller";

import {
    useFiatFundingController,
} from "@/features/funding/use-fiat-funding-controller";

const BASE_CHAIN =
    "eip155:8453" as const;

const MIN_FIAT_ONRAMP =
    20;

type FundingView =
    | "choose"
    | "crypto";

interface AddFundsDialogProps {
    readonly open:
    boolean;

    readonly walletAddress:
    string | null;

    readonly fiatEnabled:
    boolean;

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
    fiatEnabled,
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

    const wallet =
        useKeptEvmWallet();

    const externalWallet =
        useExternalFundingWallet();


    const {
        executing,
        executionStatus,
        executionError,
        executeEmbeddedFunding,
        executeExternalFunding,
        clearExecutionFeedback,
        resetExecution,
    } = useFundingExecutionController();

    const {
        fiatStatus,
        fiatError,
        handleFiatStarted,
        handleFiatSubmitted,
        handleFiatConfirmed,
        handleFiatError,
        resetFiat,
    } = useFiatFundingController({
        walletAddress,
        wallet,
        executeEmbeddedFunding,
    });

    const {
        amount: cryptoAmount,
        previewing,
        previewStatus,
        previewError,
        previewedAmount:
            previewedCryptoAmount,
        previewDetails,
        setAmount:
            setCryptoAmount,
        invalidatePreview:
            invalidateCryptoPreview,
        preview:
            previewFundingRoute,
        resetPreview,
    } = useFundingPreviewController({
        clearExecutionFeedback,
    });

    const {
        destinationAsset,
        sourceBlockchain,
        switchingSourceNetwork,
        sourceNetworkError,
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
    } = useFundingSourceController({
        active:
            open &&
            view ===
                "crypto",
        externalWallet,
        readSolanaFundingBalances,
        invalidatePreview:
            () => {
                invalidateCryptoPreview();
            },
        clearAmount:
            () => {
                setCryptoAmount(
                    "",
                );
            },
    });

    const resetDialogState =
        useCallback(
            () => {
                setView(
                    "choose",
                );

                resetPreview();

                resetFiat();

                resetExecution();

                resetSource();
            },
            [
                resetExecution,
                resetFiat,
                resetPreview,
                resetSource,
            ],
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

                        fiatEnabled={
                            fiatEnabled
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

                        onFiatSubmitted={
                            handleFiatSubmitted
                        }

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
                            void changeSourceNetwork(
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

                            selectSourceAsset(
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
                            void previewFundingRoute({
                                walletAddress,
                                externalWallet,
                                sourceAsset,
                            });
                        }}

                        onExecute={() => {
                            if (
                                previewedCryptoAmount ===
                                null
                            ) {
                                return;
                            }

                            void executeExternalFunding({
                                amount:
                                    previewedCryptoAmount,
                                walletAddress,
                                externalWallet,
                                sourceAsset,
                            });
                        }}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

function FundingChoiceView({
    walletAddress,
    fiatEnabled,
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

    readonly fiatEnabled:
    boolean;

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

                title={
                    fiatEnabled
                        ? "Buy USDC"
                        : "Buy USDC — Coming Soon"
                }

                description="Add new money using card or another supported payment method."
            >
                {!fiatEnabled ? (
                    <Button
                        className="w-full"
                        disabled
                    >
                        Coming Soon
                    </Button>
                ) : walletAddress ? (
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

    const reviewing =
        Boolean(
            previewStatus &&
            previewDetails &&
            destinationAsset &&
            sourceAsset,
        );

    if (
        reviewing &&
        previewDetails &&
        destinationAsset &&
        sourceAsset
    ) {
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
                    onClick={() => {
                        setPreviewTab(
                            "transfer",
                        );

                        onPreviewInvalidated();
                    }}
                >
                    <ArrowLeft className="mr-2 size-4" />
                    Back
                </Button>

                <DialogHeader>
                    <DialogTitle>
                        Review transfer
                    </DialogTitle>

                    <DialogDescription>
                        Check the details before adding money to Kept.
                    </DialogDescription>
                </DialogHeader>

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
                                        You'll receive at least
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
            </div>
        );
    }

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

                                    onClick={() => {
                                        setPreviewTab(
                                            "transfer",
                                        );

                                        onPreviewRoute();
                                    }}
                                >
                                    {previewing
                                        ? "Checking transfer…"
                                        : "Continue"}
                                </Button>
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