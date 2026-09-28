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
    parseUnits,
} from "viem";

import {
    useKeptEvmWallet,
    type EthereumProvider,
} from "@/chain/evm-wallet";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
    readBaseUsdcBalance,
} from "@/features/funding/base-usdc";
import {
    PrivyFundingButton,
} from "@/features/funding/PrivyFundingButton";
import {
    BASE_USDC,
} from "@/features/funding/intents/kept-funding-recipe";
import {
    previewKeptFunding,
} from "@/features/funding/intents/preview-funding";
import {
    executeKeptFunding,
} from "@/features/funding/execute-funding";
import {
    createKeptIntentsRunner,
} from "@/features/funding/intents/runner";
import {
    waitForBaseUsdcIncrease,
} from "@/features/funding/reconcile-base-usdc";
import {
    diagnostics,
} from "@/lib/diagnostics";

const BASE_CHAIN_ID =
    8453;

const BASE_CHAIN =
    "eip155:8453" as const;

const BASE_CHAIN_ID_HEX =
    "0x2105";

const MIN_FIAT_ONRAMP =
    20;

async function switchToBase(provider: EthereumProvider): Promise<void> {

    try {
        await provider.request({
            method:
                "wallet_switchEthereumChain",

            params: [
                {
                    chainId:
                        BASE_CHAIN_ID_HEX,
                },
            ],
        });
    } catch (error) {
        const code =
            typeof error === "object" &&
                error !== null &&
                "code" in error
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
                    chainId:
                        BASE_CHAIN_ID_HEX,

                    chainName:
                        "Base",

                    nativeCurrency: {
                        name:
                            "Ether",
                        symbol:
                            "ETH",
                        decimals:
                            18,
                    },

                    rpcUrls: [
                        "https://mainnet.base.org",
                    ],

                    blockExplorerUrls: [
                        "https://basescan.org",
                    ],
                },
            ],
        });
    }
}

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

async function restoreChain(
    provider: EthereumProvider,
    chainId: number,
): Promise<void> {
    if (
        chainId ===
        BASE_CHAIN_ID
    ) {
        return;
    }

    await provider.request({
        method:
            "wallet_switchEthereumChain",

        params: [
            {
                chainId:
                    `0x${chainId.toString(16)}`,
            },
        ],
    });
}

type FundingView =
    | "choose"
    | "crypto";

interface AddFundsDialogProps {
    readonly open: boolean;

    readonly walletAddress:
    string | null;

    readonly onOpenChange: (
        open: boolean,
    ) => void;

    readonly onUseAvailableCash:
    () => void;
}

export function AddFundsDialog({
    open,
    walletAddress,
    onOpenChange,
    onUseAvailableCash,
}: AddFundsDialogProps) {
    const [
        view,
        setView,
    ] = useState<FundingView>(
        "choose",
    );

    const [
        cryptoAmount,
        setCryptoAmount,
    ] = useState("");

    const [
        previewing,
        setPreviewing,
    ] = useState(false);

    const [
        previewStatus,
        setPreviewStatus,
    ] = useState<
        string | null
    >(null);

    const [
        previewError,
        setPreviewError,
    ] = useState<
        string | null
    >(null);

    const [
        fiatStartingBalance,
        setFiatStartingBalance,
    ] = useState<
        bigint | null
    >(null);

    const [
        fiatStatus,
        setFiatStatus,
    ] = useState<
        string | null
    >(null);

    const [
        fiatError,
        setFiatError,
    ] = useState<
        string | null
    >(null);

    const [
        executing,
        setExecuting,
    ] = useState(false);

    const [
        executionStatus,
        setExecutionStatus,
    ] = useState<
        string | null
    >(null);

    const [
        executionError,
        setExecutionError,
    ] = useState<
        string | null
    >(null);

    const [
        previewedCryptoAmount,
        setPreviewedCryptoAmount,
    ] = useState<
        bigint | null
    >(null);

    const wallet =
        useKeptEvmWallet();

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

    const executeFunding =
        useCallback(
            async (
                amount: bigint,
            ) => {
                if (
                    !walletAddress ||
                    executing
                ) {
                    return;
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

                    await switchToBase(
                        provider,
                    );

                    const runner =
                        createKeptIntentsRunner({
                            wallet,
                            provider,
                        });

                    try {
                        const execution =
                            await executeKeptFunding({
                                runner,
                                amount,
                                walletAddress,
                            });

                        console.log(
                            "Aurora funding execution:",
                            execution,
                        );

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
                    } finally {
                        runner.dispose();

                        try {
                            await restoreChain(
                                provider,
                                previousChainId,
                            );
                        } catch (
                        restoreError
                        ) {
                            console.warn(
                                "Unable to restore previous wallet network:",
                                restoreError,
                            );
                        }
                    }
                } catch (error) {
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

                    console.log(
                        "Base USDC received:",
                        received.toString(),
                    );

                    setFiatStatus(
                        "Your money has arrived. Moving it into Kept…",
                    );

                    await executeFunding(
                        received,
                    );

                    setFiatStatus(
                        null,
                    );
                } catch (error) {
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
                executeFunding,
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

                let amount:
                    bigint;

                try {
                    amount =
                        parseUnits(
                            cryptoAmount,
                            6,
                        );
                } catch {
                    setPreviewError(
                        "Enter a valid USDC amount.",
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

                try {
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

                    await switchToBase(
                        provider,
                    );

                    const runner =
                        createKeptIntentsRunner({
                            wallet,
                            provider,
                        });

                    try {
                        const {
                            preview,
                        } =
                            await previewKeptFunding({
                                runner,
                                amount,
                                walletAddress,
                            });

                        setPreviewedCryptoAmount(
                            amount,
                        );

                        setExecutionStatus(
                            null,
                        );

                        setExecutionError(
                            null,
                        );

                        console.log(
                            "Aurora funding preview:",
                            preview,
                        );

                        setPreviewStatus(
                            "Your transfer route is ready.",
                        );
                    } finally {
                        runner.dispose();

                        try {
                            await restoreChain(
                                provider,
                                previousChainId,
                            );
                        } catch (
                        restoreError
                        ) {
                            console.warn(
                                "Unable to restore previous wallet network:",
                                restoreError,
                            );
                        }
                    }
                } catch (error) {
                    console.error(
                        "Aurora funding preview failed:",
                        error,
                    );

                    setPreviewedCryptoAmount(
                        null,
                    );

                    setPreviewError(
                        error instanceof
                            Error
                            ? error.message
                            : "We couldn't prepare your transfer.",
                    );
                } finally {
                    setPreviewing(
                        false,
                    );
                }
            },
            [
                cryptoAmount,
                previewing,
                wallet,
                walletAddress,
            ],
        );

    const invalidateCryptoPreview =
        useCallback(
            () => {
                setPreviewedCryptoAmount(
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

                            void executeFunding(
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
                    />
                ) : (
                    <Button
                        className="w-full"
                        disabled
                    >
                        Preparing your
                        account…
                    </Button>
                )}

                {fiatStatus ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                        {fiatStatus}
                    </p>
                ) : null}

                {fiatError ? (
                    <p
                        className="mt-3 text-sm text-destructive"
                        role="alert"
                    >
                        {fiatError}
                    </p>
                ) : null}

                {executionStatus ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                        {executionStatus}
                    </p>
                ) : null}

                {executionError ? (
                    <p
                        className="mt-3 text-sm text-destructive"
                        role="alert"
                    >
                        {executionError}
                    </p>
                ) : null}

                {executing ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                        Keep this window
                        open while Kept
                        finishes adding
                        your money.
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
                description="Use crypto you already own on another network."
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
    amount,
    previewing,
    previewStatus,
    previewError,
    executing,
    executionStatus,
    executionError,
    canExecute,
    onAmountChange,
    onPreviewInvalidated,
    onBack,
    onPreviewRoute,
    onExecute,
}: {
    readonly walletAddress:
    string | null;

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
                    Move USDC you already
                    own into your Kept
                    account.
                </DialogDescription>
            </DialogHeader>

            <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <p className="font-medium">
                            USDC
                        </p>

                        <p className="text-sm text-muted-foreground">
                            From Base
                        </p>
                    </div>

                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" />

                    <div className="text-right">
                        <p className="font-medium">
                            USDC
                        </p>

                        <p className="text-sm text-muted-foreground">
                            To Kept
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
                        placeholder="20.00"
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
                        USDC
                    </span>
                </div>
            </div>

            {!canExecute ? (
                <Button
                    type="button"
                    className="w-full"
                    disabled={
                        !walletAddress ||
                        previewing ||
                        executing ||
                        amount.trim()
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

            {previewStatus ? (
                <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-sm">
                        {previewStatus}
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                        Review the amount
                        before confirming
                        your transfer.
                    </p>
                </div>
            ) : null}

            {previewError ? (
                <p
                    className="text-sm text-destructive"
                    role="alert"
                >
                    {previewError}
                </p>
            ) : null}

            {canExecute ? (
                <Button
                    type="button"
                    className="w-full"
                    disabled={
                        executing
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
                    {executionError}
                </p>
            ) : null}

            <p className="text-xs leading-5 text-muted-foreground">
                Transfers are routed
                securely into Kept.
                Network and provider
                fees may apply.
            </p>
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
                    {icon}
                </div>

                <div>
                    <p className="font-medium">
                        {title}
                    </p>

                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {description}
                    </p>
                </div>
            </div>

            <div className="mt-4">
                {children}
            </div>
        </div>
    );
}