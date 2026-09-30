import {
    useEffect,
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
    formatUsdc,
} from "@/features/savings/format";

import type {
    FundingAsset,
} from "@/features/funding/intents/supported-tokens";

import {
    CryptoWithdrawalStep,
} from "./CryptoWithdrawalStep";


type WithdrawalView =
    | "choose"
    | "available-cash"
    | "crypto"
    | "bank";


interface WithdrawablePosition {
    readonly withdrawableAssets:
    bigint;

    readonly usdcBalance:
    bigint;
}


interface WithdrawFundsDialogProps {
    readonly open:
    boolean;

    readonly position:
    WithdrawablePosition | null;

    readonly amount:
    string;

    readonly status:
    string | null;

    readonly error:
    string | null;

    readonly submitting:
    boolean;

    readonly cryptoAvailable?:
    boolean;

    readonly bankAvailable?:
    boolean;

    readonly onOpenChange: (
        open: boolean,
    ) => void;

    readonly onAmountChange: (
        value: string,
    ) => void;

    readonly onSubmitAvailableCash:
    () => void;

    readonly cryptoAmount:
    string;

    readonly cryptoRecipient:
    string;

    readonly cryptoDestinationAssets:
    readonly FundingAsset[];

    readonly cryptoDestinationAssetId:
    string | null;

    readonly cryptoPreviewing:
    boolean;

    readonly cryptoPreviewReady:
    boolean;

    readonly cryptoPreviewStatus:
    string | null;

    readonly cryptoPreviewError:
    string | null;

    readonly cryptoExecuting:
    boolean;

    readonly cryptoExecutionStatus:
    string | null;

    readonly cryptoExecutionError:
    string | null;

    readonly cryptoEstimatedReceive?:
    string | null;

    readonly onCryptoAmountChange: (
        value: string,
    ) => void;

    readonly onCryptoRecipientChange: (
        value: string,
    ) => void;

    readonly onCryptoDestinationAssetChange: (
        assetId: string,
    ) => void;

    readonly onPreviewCryptoWithdrawal:
    () => void;

    readonly onExecuteCryptoWithdrawal:
    () => void;

    readonly bankAmount:
    string;

    readonly bankSubmitting:
    boolean;

    readonly bankStatus:
    string | null;

    readonly bankError:
    string | null;

    readonly onBankAmountChange: (
        value: string,
    ) => void;

    readonly onStartBankWithdrawal:
    () => void;
}


export function WithdrawFundsDialog({
    open,
    position,
    amount,
    status,
    error,
    submitting,

    cryptoAvailable = false,

    cryptoAmount,
    cryptoRecipient,
    cryptoDestinationAssets,
    cryptoDestinationAssetId,
    cryptoPreviewing,
    cryptoPreviewReady,
    cryptoPreviewStatus,
    cryptoPreviewError,
    cryptoExecuting,
    cryptoExecutionStatus,
    cryptoExecutionError,
    cryptoEstimatedReceive = null,

    bankAvailable = false,
    bankAmount,
    bankSubmitting,
    bankStatus,
    bankError,

    onOpenChange,
    onAmountChange,
    onSubmitAvailableCash,

    onCryptoAmountChange,
    onCryptoRecipientChange,
    onCryptoDestinationAssetChange,
    onPreviewCryptoWithdrawal,
    onExecuteCryptoWithdrawal,

    onBankAmountChange,
    onStartBankWithdrawal,
}: WithdrawFundsDialogProps) {
    const [
        view,
        setView,
    ] =
        useState<WithdrawalView>(
            "choose",
        );

    useEffect(
        () => {
            if (!open) {
                setView(
                    "choose",
                );
            }
        },
        [
            open,
        ],
    );

    const withdrawableAssets =
        position?.withdrawableAssets ??
        0n;

    const availableCash =
        position?.usdcBalance ??
        0n;

    const withdrawableSavings =
        position?.withdrawableAssets ??
        0n;

    const totalAvailableAssets =
        availableCash +
        withdrawableSavings;

    const chooseAvailableCash =
        () => {
            setView(
                "available-cash",
            );
        };

    const handleOpenChange =
        (
            nextOpen: boolean,
        ) => {
            if (!nextOpen) {
                setView(
                    "choose",
                );
            }

            onOpenChange(
                nextOpen,
            );
        };

    return (
        <Dialog
            open={open}
            onOpenChange={
                handleOpenChange
            }
        >
            <DialogContent className="sm:max-w-lg">
                {view ===
                    "choose" ? (
                    <>
                        <DialogHeader>
                            <DialogTitle>
                                Withdraw money
                            </DialogTitle>

                            <DialogDescription>
                                Choose where you'd like your money to go.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="rounded-lg border bg-muted/20 px-4 py-3">
                            <p className="text-sm text-muted-foreground">
                                Available to withdraw
                            </p>

                            <p className="mt-1 text-lg font-semibold tabular-nums">
                                {formatUsdc(
                                    totalAvailableAssets,
                                )}{" "}
                                USDC
                            </p>
                        </div>

                        <div className="space-y-3 pt-2">
                            <WithdrawalMethod
                                icon={
                                    <WalletCards className="size-5" />
                                }
                                title="Available cash"
                                description="Move money out of savings and keep it ready to use in Kept."
                                onClick={
                                    chooseAvailableCash
                                }
                            />

                            {cryptoAvailable && (
                                <WithdrawalMethod
                                    icon={
                                        <WalletCards className="size-5" />
                                    }
                                    title="Crypto wallet"
                                    description="Send money to another wallet or network."
                                    onClick={() =>
                                        setView(
                                            "crypto",
                                        )
                                    }
                                />
                            )}

                            {bankAvailable && (
                                <WithdrawalMethod
                                    icon={
                                        <Landmark className="size-5" />
                                    }
                                    title="Bank account"
                                    description="Withdraw money to your bank account."
                                    onClick={() =>
                                        setView(
                                            "bank",
                                        )
                                    }
                                />
                            )}
                        </div>
                    </>
                ) : view ===
                    "available-cash" ? (
                    <>
                        <DialogHeader>
                            <div className="mb-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="-ml-2"
                                    disabled={
                                        submitting
                                    }
                                    onClick={() =>
                                        setView(
                                            "choose",
                                        )
                                    }
                                >
                                    <ArrowLeft className="size-4" />
                                    Back
                                </Button>
                            </div>

                            <DialogTitle>
                                Move to available cash
                            </DialogTitle>

                            <DialogDescription>
                                Withdraw money from your Kept savings.
                                It will remain in your Kept account and
                                be ready to use.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-5">
                            <div className="space-y-2">
                                <label
                                    htmlFor="withdraw-available-cash-amount"
                                    className="text-sm font-medium"
                                >
                                    Amount
                                </label>

                                <div className="relative">
                                    <Input
                                        id="withdraw-available-cash-amount"
                                        inputMode="decimal"
                                        autoComplete="off"
                                        value={
                                            amount
                                        }
                                        disabled={
                                            submitting
                                        }
                                        placeholder="0.00"
                                        className="pr-16"
                                        onChange={
                                            (
                                                event,
                                            ) =>
                                                onAmountChange(
                                                    event
                                                        .target
                                                        .value,
                                                )
                                        }
                                    />

                                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                                        USDC
                                    </span>
                                </div>

                                <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                                    <span>
                                        Available from savings
                                    </span>

                                    <button
                                        type="button"
                                        disabled={
                                            submitting ||
                                            withdrawableAssets ===
                                            0n
                                        }
                                        className="font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50"
                                        onClick={() =>
                                            onAmountChange(
                                                formatUsdc(
                                                    withdrawableAssets,
                                                ),
                                            )
                                        }
                                    >
                                        {formatUsdc(
                                            withdrawableAssets,
                                        )}{" "}
                                        USDC
                                    </button>
                                </div>
                            </div>

                            {error && (
                                <p
                                    role="alert"
                                    className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                                >
                                    {error}
                                </p>
                            )}

                            {status && (
                                <p
                                    role="status"
                                    className="rounded-lg border bg-muted/20 px-4 py-3 text-sm"
                                >
                                    {status}
                                </p>
                            )}

                            <Button
                                type="button"
                                className="w-full"
                                disabled={
                                    submitting ||
                                    withdrawableAssets ===
                                    0n ||
                                    amount
                                        .trim()
                                        .length ===
                                    0
                                }
                                onClick={
                                    onSubmitAvailableCash
                                }
                            >
                                {submitting
                                    ? "Withdrawing…"
                                    : "Withdraw to available cash"}
                            </Button>
                        </div>
                    </>
                ) : view ===
                    "crypto" ? (
                    <CryptoWithdrawalStep
                        availableAssets={
                            totalAvailableAssets
                        }
                        amount={
                            cryptoAmount
                        }
                        recipient={
                            cryptoRecipient
                        }
                        destinationAssets={
                            cryptoDestinationAssets
                        }
                        destinationAssetId={
                            cryptoDestinationAssetId
                        }
                        previewing={
                            cryptoPreviewing
                        }
                        previewReady={
                            cryptoPreviewReady
                        }
                        previewStatus={
                            cryptoPreviewStatus
                        }
                        previewError={
                            cryptoPreviewError
                        }
                        executing={
                            cryptoExecuting
                        }
                        executionStatus={
                            cryptoExecutionStatus
                        }
                        executionError={
                            cryptoExecutionError
                        }
                        estimatedReceive={
                            cryptoEstimatedReceive
                        }
                        onBack={() =>
                            setView(
                                "choose",
                            )
                        }
                        onAmountChange={
                            onCryptoAmountChange
                        }
                        onRecipientChange={
                            onCryptoRecipientChange
                        }
                        onDestinationAssetChange={
                            onCryptoDestinationAssetChange
                        }
                        onPreview={
                            onPreviewCryptoWithdrawal
                        }
                        onExecute={
                            onExecuteCryptoWithdrawal
                        }
                    />
                ) : (
                    <>
                        <DialogHeader>
                            <div className="mb-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="-ml-2"
                                    disabled={
                                        bankSubmitting
                                    }
                                    onClick={() =>
                                        setView(
                                            "choose",
                                        )
                                    }
                                >
                                    <ArrowLeft className="size-4" />
                                    Back
                                </Button>
                            </div>

                            <DialogTitle>
                                Withdraw to bank
                            </DialogTitle>

                            <DialogDescription>
                                Choose how much you'd like to withdraw.
                                Bank details and identity checks are
                                handled securely by our payment partner.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-5">
                            <div className="space-y-2">
                                <label
                                    htmlFor="withdraw-bank-amount"
                                    className="text-sm font-medium"
                                >
                                    Amount
                                </label>

                                <div className="relative">
                                    <Input
                                        id="withdraw-bank-amount"
                                        inputMode="decimal"
                                        autoComplete="off"
                                        value={
                                            bankAmount
                                        }
                                        disabled={
                                            bankSubmitting
                                        }
                                        placeholder="0.00"
                                        className="pr-16"
                                        onChange={
                                            (
                                                event,
                                            ) =>
                                                onBankAmountChange(
                                                    event
                                                        .target
                                                        .value,
                                                )
                                        }
                                    />

                                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                                        USDC
                                    </span>
                                </div>

                                <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                                    <span>
                                        Available to withdraw
                                    </span>

                                    <button
                                        type="button"
                                        disabled={
                                            bankSubmitting ||
                                            totalAvailableAssets ===
                                            0n
                                        }
                                        className="font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50"
                                        onClick={() =>
                                            onBankAmountChange(
                                                formatUsdc(
                                                    totalAvailableAssets,
                                                ),
                                            )
                                        }
                                    >
                                        {formatUsdc(
                                            totalAvailableAssets,
                                        )}{" "}
                                        USDC
                                    </button>
                                </div>
                            </div>

                            {bankError && (
                                <p
                                    role="alert"
                                    className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                                >
                                    {bankError}
                                </p>
                            )}

                            {bankStatus && (
                                <p
                                    role="status"
                                    className="rounded-lg border bg-muted/20 px-4 py-3 text-sm"
                                >
                                    {bankStatus}
                                </p>
                            )}

                            <Button
                                type="button"
                                className="w-full"
                                disabled={
                                    bankSubmitting ||
                                    bankAmount
                                        .trim()
                                        .length ===
                                    0 ||
                                    totalAvailableAssets ===
                                    0n
                                }
                                onClick={
                                    onStartBankWithdrawal
                                }
                            >
                                {bankSubmitting
                                    ? "Preparing…"
                                    : "Continue"}
                            </Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}


interface WithdrawalMethodProps {
    readonly icon:
    ReactNode;

    readonly title:
    string;

    readonly description:
    string;

    readonly onClick:
    () => void;
}


function WithdrawalMethod({
    icon,
    title,
    description,
    onClick,
}: WithdrawalMethodProps) {
    return (
        <button
            type="button"
            onClick={
                onClick
            }
            className="
                group flex w-full items-center gap-4 rounded-xl
                border bg-background p-4 text-left transition
                hover:border-primary/30 hover:bg-accent/30
                focus-visible:outline-none focus-visible:ring-2
                focus-visible:ring-ring focus-visible:ring-offset-2
            "
        >
            <div
                className="
                    grid size-11 shrink-0 place-items-center
                    rounded-full border bg-muted/30
                    text-muted-foreground transition
                    group-hover:text-primary
                "
            >
                {icon}
            </div>

            <div className="min-w-0 flex-1">
                <p className="font-medium">
                    {title}
                </p>

                <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    {description}
                </p>
            </div>

            <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
        </button>
    );
}