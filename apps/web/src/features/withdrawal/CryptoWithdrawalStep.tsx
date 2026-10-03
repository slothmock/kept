import {
    ArrowLeft,
} from "lucide-react";

import {
    isAddress,
} from "viem";

import {
    Button,
} from "@/components/ui/button";

import {
    Input,
} from "@/components/ui/input";

import type {
    FundingAsset,
} from "@/features/funding/intents/supported-tokens";

import {
    formatUsdc,
} from "@/features/savings/format";

import {
    FundingAssetPicker,
    FormatFundingChainName
} from "@/features/funding/FundingAssetPicker";

interface CryptoWithdrawalStepProps {
    readonly availableAssets:
    bigint;

    readonly amount:
    string;

    readonly recipient:
    string;

    readonly destinationAssets:
    readonly FundingAsset[];

    readonly destinationAssetId:
    string | null;

    readonly previewing:
    boolean;

    readonly previewReady:
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

    readonly estimatedReceive?:
    string | null;

    readonly onBack:
    () => void;

    readonly onAmountChange: (
        value: string,
    ) => void;

    readonly onRecipientChange: (
        value: string,
    ) => void;

    readonly onDestinationAssetChange: (
        assetId: string,
    ) => void;

    readonly onPreview:
    () => void;

    readonly onExecute:
    () => void;
}

export function CryptoWithdrawalStep({
    availableAssets,
    amount,
    recipient,
    destinationAssets,
    destinationAssetId,
    previewing,
    previewReady,
    previewStatus,
    previewError,
    executing,
    executionStatus,
    executionError,
    estimatedReceive = null,
    onBack,
    onAmountChange,
    onRecipientChange,
    onDestinationAssetChange,
    onPreview,
    onExecute,
}: CryptoWithdrawalStepProps) {
    const destinationAsset =
        destinationAssets.find(
            (asset) =>
                asset.assetId ===
                destinationAssetId,
        ) ?? null;

    const networks =
        Array.from(
            new Set(
                destinationAssets.map(
                    (asset) =>
                        asset.blockchain,
                ),
            ),
        );

    const selectedNetwork =
        destinationAsset
            ?.blockchain ??
        networks[0] ??
        null;

    const amountValid =
        amount.trim().length >
        0;

    const busy =
        previewing ||
        executing;

    const destinationIsSolana =
        selectedNetwork ===
        "sol";

    const recipientValid =
        recipient.length > 0 &&
        (
            destinationIsSolana
                ? recipient.length >= 32 &&
                recipient.length <= 44
                : isAddress(
                    recipient,
                )
        );

    const canPreview =
        amountValid &&
        recipientValid &&
        destinationAsset !==
        null &&
        !busy;

    const canExecute =
        previewReady &&
        recipientValid &&
        destinationAsset !==
        null &&
        !busy;

    const destinationBlockchains =
        Array.from(
            new Set(
                destinationAssets.map(
                    (asset) =>
                        asset.blockchain,
                ),
            ),
        );

    const filteredDestinationAssets =
        selectedNetwork
            ? destinationAssets.filter(
                (asset) =>
                    asset.blockchain ===
                    selectedNetwork,
            )
            : [];

    const EMPTY_BALANCES:
        ReadonlyMap<
            string,
            bigint | null
        > =
        new Map();

    return (
        <>
            <div className="mb-2">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-ml-2"
                    disabled={busy}
                    onClick={
                        onBack
                    }
                >
                    <ArrowLeft className="size-4" />

                    Back
                </Button>
            </div>

            <div>
                <h2 className="text-lg font-semibold">
                    Send to a crypto wallet
                </h2>

                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Send money from Kept to another wallet.
                    Kept will handle any network transfer
                    needed.
                </p>
            </div>

            <div className="mt-6 space-y-6">
                <div className="space-y-2">
                    <label
                        htmlFor="crypto-withdrawal-amount"
                        className="text-sm font-medium"
                    >
                        Amount
                    </label>

                    <div className="relative">
                        <Input
                            id="crypto-withdrawal-amount"
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder="0.00"
                            value={
                                amount
                            }
                            disabled={
                                busy
                            }
                            className="pr-16"
                            onChange={(
                                event,
                            ) =>
                                onAmountChange(
                                    event.target.value,
                                )
                            }
                        />

                        <span
                            className="
                                pointer-events-none
                                absolute right-3 top-1/2
                                -translate-y-1/2
                                text-sm
                                text-muted-foreground
                            "
                        >
                            USDC
                        </span>
                    </div>

                    <div
                        className="
                            flex items-center
                            justify-between gap-3
                            text-sm
                            text-muted-foreground
                        "
                    >
                        <span>
                            Available to send
                        </span>

                        <button
                            type="button"
                            disabled={
                                busy ||
                                availableAssets ===
                                0n
                            }
                            className="
                                font-medium
                                text-foreground
                                underline-offset-4
                                hover:underline
                                disabled:opacity-50
                            "
                            onClick={() =>
                                onAmountChange(
                                    formatUsdc(
                                        availableAssets,
                                    ),
                                )
                            }
                        >
                            {formatUsdc(
                                availableAssets,
                            )}{" "}
                            USDC
                        </button>
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-[0.85fr_1.15fr]">
                    <div className="space-y-2">
                        <label
                            htmlFor="crypto-withdrawal-network"
                            className="text-sm font-medium"
                        >
                            Network
                        </label>

                        <select
                            id="crypto-withdrawal-network"
                            value={
                                selectedNetwork ??
                                ""
                            }
                            disabled={
                                busy
                            }
                            onChange={(
                                event,
                            ) => {
                                const blockchain =
                                    event.target.value;

                                const firstAsset =
                                    destinationAssets.find(
                                        (asset) =>
                                            asset.blockchain ===
                                            blockchain,
                                    );

                                if (
                                    firstAsset
                                ) {
                                    onDestinationAssetChange(
                                        firstAsset.assetId,
                                    );
                                }
                            }}
                            className="flex h-15 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {destinationBlockchains.map(
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
                                        {FormatFundingChainName(blockchain)}
                                    </option>
                                ),
                            )}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">
                            Asset
                        </label>

                        <FundingAssetPicker
                            assets={
                                filteredDestinationAssets
                            }
                            selectedAsset={
                                destinationAsset
                            }
                            showBalances={false}
                            balances={EMPTY_BALANCES}
                            balancesLoading={
                                false
                            }
                            disabled={
                                busy
                            }
                            onSelect={
                                onDestinationAssetChange
                            }
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <label
                        htmlFor="crypto-withdrawal-recipient"
                        className="text-sm font-medium"
                    >
                        Wallet address
                    </label>

                    <Input
                        id="crypto-withdrawal-recipient"
                        value={
                            recipient
                        }
                        disabled={
                            busy
                        }
                        autoComplete="off"
                        spellCheck={
                            false
                        }
                        placeholder={
                            destinationIsSolana
                                ? "Solana wallet address"
                                : "0x…"
                        }
                        onChange={(
                            event,
                        ) =>
                            onRecipientChange(
                                event.target.value,
                            )
                        }
                    />

                    {recipient.length >
                        0 &&
                        !recipientValid && (
                            <p className="text-sm text-destructive">
                                Enter a valid wallet address.
                            </p>
                        )}
                </div>

                {previewReady &&
                    destinationAsset && (
                        <div
                            className="
                                space-y-3 rounded-xl
                                border bg-muted/20 p-4
                            "
                        >
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-sm text-muted-foreground">
                                    You send
                                </span>

                                <span className="text-sm font-medium tabular-nums">
                                    {amount} USDC
                                </span>
                            </div>

                            <div className="flex items-center justify-between gap-4">
                                <span className="text-sm text-muted-foreground">
                                    Network
                                </span>

                                <span className="text-sm font-medium">
                                    {FormatFundingChainName(
                                        destinationAsset.blockchain,
                                    )}
                                </span>
                            </div>

                            <div className="flex items-center justify-between gap-4">
                                <span className="text-sm text-muted-foreground">
                                    Asset
                                </span>

                                <span className="text-sm font-medium">
                                    {
                                        destinationAsset.symbol
                                    }
                                </span>
                            </div>

                            <div className="flex items-center justify-between gap-4">
                                <span className="text-sm text-muted-foreground">
                                    Receive
                                </span>

                                <span className="text-sm font-medium tabular-nums">
                                    {estimatedReceive ??
                                        "Calculated at transfer"}{" "}
                                    {estimatedReceive
                                        ? destinationAsset.symbol
                                        : ""}
                                </span>
                            </div>

                            <div className="flex items-start justify-between gap-4">
                                <span className="text-sm text-muted-foreground">
                                    To
                                </span>

                                <span className="max-w-[65%] break-all text-right text-sm font-medium">
                                    {
                                        recipient
                                    }
                                </span>
                            </div>
                        </div>
                    )}

                {previewError && (
                    <p
                        role="alert"
                        className="
                            rounded-lg border
                            border-destructive/20
                            bg-destructive/5
                            px-4 py-3 text-sm
                            text-destructive
                        "
                    >
                        {previewError}
                    </p>
                )}

                {previewStatus && (
                    <p
                        role="status"
                        className="
                            rounded-lg border
                            bg-muted/20
                            px-4 py-3 text-sm
                        "
                    >
                        {previewStatus}
                    </p>
                )}

                {executionError && (
                    <p
                        role="alert"
                        className="
                            rounded-lg border
                            border-destructive/20
                            bg-destructive/5
                            px-4 py-3 text-sm
                            text-destructive
                        "
                    >
                        {executionError}
                    </p>
                )}

                {executionStatus && (
                    <p
                        role="status"
                        className="
                            rounded-lg border
                            bg-muted/20
                            px-4 py-3 text-sm
                        "
                    >
                        {executionStatus}
                    </p>
                )}

                {!previewReady ? (
                    <Button
                        type="button"
                        className="w-full"
                        disabled={
                            !canPreview
                        }
                        onClick={
                            onPreview
                        }
                    >
                        {previewing
                            ? "Checking transfer…"
                            : "Review transfer"}
                    </Button>
                ) : (
                    <Button
                        type="button"
                        className="w-full"
                        disabled={
                            !canExecute
                        }
                        onClick={
                            onExecute
                        }
                    >
                        {executing
                            ? "Sending…"
                            : "Confirm withdrawal"}
                    </Button>
                )}
            </div>
        </>
    );
}