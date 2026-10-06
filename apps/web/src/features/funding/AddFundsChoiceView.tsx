import type {
    ReactNode,
} from "react";

import {
    ArrowRight,
    Landmark,
    WalletCards,
} from "lucide-react";

import {
    Button,
} from "@/components/ui/button";

import {
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

import {
    BASE_USDC,
} from "@/features/funding/intents/kept-funding-recipe";

import {
    PrivyFundingButton,
} from "@/features/funding/PrivyFundingButton";

const BASE_CHAIN =
    "eip155:8453" as const;

const MIN_FIAT_ONRAMP =
    20;

export function AddFundsChoiceView({
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
