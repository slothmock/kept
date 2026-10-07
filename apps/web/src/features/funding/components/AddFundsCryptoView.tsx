import {
    useState,
} from "react";

import {
    ArrowLeft,
    ArrowRight,
} from "lucide-react";

import {
    formatUnits,
} from "viem";

import {
    Button,
} from "@/components/ui/button";

import {
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

import {
    Input,
} from "@/components/ui/input";

import {
    FundingAssetPicker,
    FormatFundingChainName,
} from "@/features/funding/components/FundingAssetPicker";

import type {
    FundingAsset,
} from "@/features/funding/intents/supported-tokens";

import type {
    ExternalFundingWalletOption,
} from "@/features/funding/use-external-funding-wallet";

import type {
    FundingPreviewDetails,
} from "@/features/funding/use-funding-preview-controller";

export function AddFundsCryptoView({
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
            <div className="space-y-6">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-ml-3 text-muted-foreground"
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
                        Confirm the route and minimum amount before the transfer begins.
                    </DialogDescription>
                </DialogHeader>

                <div className="overflow-hidden rounded-lg border border-border bg-surface">
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
                                    ? "rounded-md bg-accent px-3 py-2 text-label font-medium text-accent-foreground"
                                    : "rounded-md px-3 py-2 text-label text-muted-foreground"
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
                                    ? "rounded-md bg-accent px-3 py-2 text-label font-medium text-accent-foreground"
                                    : "rounded-md px-3 py-2 text-label text-muted-foreground"
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
                            <div className="rounded-md bg-accent/50 p-4">
                                <p className="text-caption text-muted-foreground">
                                    You&apos;re sending
                                </p>

                                <p className="mt-1 text-h3 font-semibold tabular-nums">
                                    {amount} {sourceAsset.symbol}
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-caption text-muted-foreground">
                                        From
                                    </p>

                                    <p className="mt-1 text-label font-medium">
                                        {
                                            FormatFundingChainName(
                                                sourceAsset.blockchain,
                                            )
                                        }
                                    </p>
                                </div>

                                <div className="text-right">
                                    <p className="text-caption text-muted-foreground">
                                        You'll receive at least
                                    </p>

                                    <p className="mt-1 text-label font-semibold tabular-nums text-success">
                                        {formatUnits(
                                            BigInt(previewDetails.minimumAmountOut),
                                            destinationAsset.decimals,
                                        )} {destinationAsset.symbol}
                                    </p>
                                </div>
                            </div>

                            {previewDetails.estimatedTime ? (
                                <div className="flex items-center justify-between gap-4 border-t pt-3 text-label">
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
                            className="space-y-3 p-4 text-label"
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
                    <div className="rounded-lg border border-border bg-surface p-3">
                        <p className="text-label">
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

                <p className="text-caption text-muted-foreground">
                    Kept converts the selected asset to USDC during the transfer. Network and provider fees may apply.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-ml-3 text-muted-foreground"

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
                    Choose a wallet, network, asset, and amount. Kept will show the route before anything moves.
                </DialogDescription>
            </DialogHeader>

            <div className="rounded-lg border border-border bg-surface p-4">
                <p className="text-label font-medium">
                    Source wallet
                </p>

                {externalWalletConnected ? (
                    <div className="mt-2 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                            <p className="text-label font-medium capitalize">
                                {externalWalletClientType ??
                                    "External wallet"}
                                {externalWalletFamily === "sol"
                                    ? " · Solana"
                                    : externalWalletFamily === "evm"
                                      ? " · EVM"
                                      : ""}
                            </p>

                            <p className="truncate text-caption text-muted-foreground">
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
                                <p className="text-caption text-muted-foreground">
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
                            <div className="rounded-lg border border-border bg-surface p-3">
                                <p className="mb-2 text-label font-medium">
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
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <label
                                htmlFor="crypto-funding-network"
                                className="text-label font-medium"
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
                                className="flex h-12 w-full rounded-md border border-input bg-surface px-3 py-2 text-label outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50"
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
                            <label className="text-label font-medium">
                                Asset
                            </label>

                            {sourceAssetsLoading ? (
                                <div className="flex h-10 items-center rounded-md border px-3 text-caption text-muted-foreground">
                                    Loading assets…
                                </div>
                            ) : sourceAssetsError ? (
                                <div className="flex h-12 items-center rounded-md border border-destructive/25 bg-danger-surface px-3 text-caption text-destructive">
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
                                <div className="flex h-10 items-center rounded-md border px-3 text-caption text-muted-foreground">
                                    No supported assets
                                </div>
                            )}
                        </div>
                    </div>

                    {switchingSourceNetwork ? (
                        <p className="text-caption text-muted-foreground">
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
                            <div className="rounded-lg border border-border bg-surface p-4">
                                <p className="mb-3 text-caption font-medium text-muted-foreground">
                                    Transfer route
                                </p>
                                <div className="flex items-center justify-between gap-4">
                                    <div className="min-w-0">
                                        <p className="font-medium">
                                            {
                                                sourceAsset.symbol
                                            }
                                        </p>

                                        <p className="text-caption text-muted-foreground">
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

                                        <p className="text-caption text-muted-foreground">
                                            Kept (Monad)
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label
                                    htmlFor="crypto-funding-amount"
                                    className="text-label font-medium"
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

                                        className="h-12 pr-20 text-body font-medium tabular-nums"

                                        onChange={(
                                            event,
                                        ) => {
                                            onAmountChange(
                                                event.target.value,
                                            );

                                            onPreviewInvalidated();
                                        }}
                                    />

                                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-caption text-muted-foreground">
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

                            <p className="text-caption text-muted-foreground">
                                Kept converts the selected asset to USDC during the transfer. Network and provider fees may apply.
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

            <span className="max-w-xs break-all text-right font-medium text-foreground">
                {
                    value
                }
            </span>
        </div>
    );
}


