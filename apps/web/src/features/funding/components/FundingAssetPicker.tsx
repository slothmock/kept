import {
    useMemo,
    useState,
} from "react";

import {
    Check,
    ChevronsUpDown,
} from "lucide-react";

import {
    Button,
} from "@/components/ui/button";

import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";

import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

import type {
    FundingAsset,
} from "@/features/funding/intents/supported-tokens";

import {
    cn,
} from "@/lib/utils";

import {
    formatFundingAssetBalance,
} from "@/features/funding/intents/funding-asset-balances";

interface FundingAssetPickerProps {
    readonly assets:
    readonly FundingAsset[];

    readonly selectedAsset:
    FundingAsset | null;

    readonly disabled?:
    boolean;

    readonly showBalances?:
    boolean;

    readonly balances:
    ReadonlyMap<
        string,
        bigint | null
    >;

    readonly balancesLoading?:
    boolean;

    readonly onSelect: (
        assetId: string,
    ) => void;
}

export function FormatFundingChainName(
    blockchain: string,
): string {
    switch (
    blockchain
    ) {
        case "monad":
        case "mon":
            return "Monad";

        case "ethereum":
        case "eth":
            return "Ethereum";

        case "base":
            return "Base";

        case "arb":
        case "arbitrum":
            return "Arbitrum";

        case "op":
        case "optimism":
            return "Optimism";

        case "solana":
        case "sol":
            return "Solana";

        default:
            return blockchain;
    }
}

function assetSearchValue(
    asset: FundingAsset,
): string {
    return [
        asset.symbol,
        asset.blockchain,
        FormatFundingChainName(
            asset.blockchain,
        ),
    ]
        .join(" ")
        .toLowerCase();
}

export function FundingAssetPicker({
    assets,
    selectedAsset,
    balances,
    balancesLoading = false,
    disabled = false,
    onSelect,
}: FundingAssetPickerProps) {
    const [
        open,
        setOpen,
    ] =
        useState(false);

    const sortedAssets =
        useMemo(
            () =>
                [...assets].sort(
                    (
                        left,
                        right,
                    ) => {
                        const leftBalance =
                            balances.get(
                                left.assetId,
                            ) ??
                            0n;

                        const rightBalance =
                            balances.get(
                                right.assetId,
                            ) ??
                            0n;

                        const leftOwned =
                            leftBalance >
                            0n;

                        const rightOwned =
                            rightBalance >
                            0n;

                        if (
                            leftOwned !==
                            rightOwned
                        ) {
                            return leftOwned
                                ? -1
                                : 1;
                        }

                        const symbol =
                            left.symbol.localeCompare(
                                right.symbol,
                            );

                        if (
                            symbol !==
                            0
                        ) {
                            return symbol;
                        }

                        return FormatFundingChainName(
                            left.blockchain,
                        ).localeCompare(
                            FormatFundingChainName(
                                right.blockchain,
                            ),
                        );
                    },
                ),
            [
                assets,
                balances,
            ],
        );

    return (
        <Popover
            open={
                open
            }

            onOpenChange={
                setOpen
            }
        >
            <PopoverTrigger
                render={
                    <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        disabled={disabled}
                        className="h-15 w-full justify-between px-3 py-2 font-normal"
                    />
                }
            >
                {selectedAsset ? (
                    <div className="min-w-0 text-left">
                        <p className="truncate text-sm font-medium">
                            {selectedAsset.symbol}
                        </p>

                        <p className="truncate text-xs text-muted-foreground">
                            {FormatFundingChainName(
                                selectedAsset.blockchain,
                            )}
                        </p>
                    </div>
                ) : (
                    <span className="text-muted-foreground">
                        Choose an asset
                    </span>
                )}

                <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
            </PopoverTrigger>

            <PopoverContent
                align="start"
                className="w-[var(--anchor-width)] p-0"
            >
                <Command>
                    <CommandInput
                        placeholder="Search assets or networks…"
                    />

                    <CommandList className="max-h-72 overflow-y-auto">
                        <CommandEmpty>
                            No supported assets found.
                        </CommandEmpty>

                        <CommandGroup>
                            {sortedAssets.map(
                                (
                                    asset,
                                ) => {
                                    const selected =
                                        selectedAsset
                                            ?.assetId ===
                                        asset.assetId;

                                    return (
                                        <CommandItem
                                            key={
                                                asset.assetId
                                            }

                                            value={
                                                assetSearchValue(
                                                    asset,
                                                )
                                            }

                                            onSelect={() => {
                                                onSelect(
                                                    asset.assetId,
                                                );

                                                setOpen(
                                                    false,
                                                );
                                            }}

                                            className="flex items-center gap-3 py-3"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-medium">
                                                            {
                                                                asset.symbol
                                                            }
                                                        </p>

                                                        <p className="truncate text-xs text-muted-foreground">
                                                            {
                                                                FormatFundingChainName(
                                                                    asset.blockchain,
                                                                )
                                                            }
                                                        </p>
                                                    </div>

                                                    <div className="shrink-0 text-right">
                                                        {balancesLoading ? (
                                                            <span className="text-xs text-muted-foreground">
                                                                …
                                                            </span>
                                                        ) : (
                                                            (() => {
                                                                const balance =
                                                                    balances.get(
                                                                        asset.assetId,
                                                                    );

                                                                if (
                                                                    balance ===
                                                                    undefined ||
                                                                    balance ===
                                                                    null
                                                                ) {
                                                                    return (
                                                                        <span className="text-xs text-muted-foreground">
                                                                            —
                                                                        </span>
                                                                    );
                                                                }

                                                                return (
                                                                    <>
                                                                        <p className="text-sm font-medium tabular-nums">
                                                                            {
                                                                                formatFundingAssetBalance(
                                                                                    asset,
                                                                                    balance,
                                                                                )
                                                                            }
                                                                        </p>

                                                                        <p className="text-xs text-muted-foreground">
                                                                            {
                                                                                asset.symbol
                                                                            }
                                                                        </p>
                                                                    </>
                                                                );
                                                            })()
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <Check
                                                className={cn(
                                                    "size-4 shrink-0",
                                                    selected
                                                        ? "opacity-100"
                                                        : "opacity-0",
                                                )}
                                            />
                                        </CommandItem>
                                    );
                                },
                            )}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}