import {
    ArrowDownLeft,
    ArrowLeft,
    ArrowUpRight,
    Check,
    Copy,
    ExternalLink,
    Gift,
    History,
    LogOut,
    ShieldCheck,
    UserRound,
    WalletCards,
} from "lucide-react";
import {
    useEffect,
    useMemo,
    useState,
} from "react";
import {
    Link,
    useNavigate,
} from "react-router-dom";

import {
    createKeptApi,
    readApiBaseUrl,
    type SavingsMarketStatusDto,
    type TransactionDto,
    type TransactionType,
} from "@/api/kept-api";
import type {
    Session,
} from "@/auth/session";
import {
    useKeptEvmWallet,
} from "@/chain/evm-wallet";
import {
    AccountMenu,
} from "@/components/AccountMenu";
import {
    AppShell,
} from "@/components/AppShell";
import {
    Button,
} from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Skeleton,
} from "@/components/ui/skeleton";
import {
    readSavingsTransparency,
    type SavingsTransparency,
} from "@/features/account/savings-transparency";
import {
    consumerErrorMessage,
} from "@/lib/consumer-error";
import {
    diagnostics,
} from "@/lib/diagnostics";

function shortAddress(
    address: string,
): string {
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatBps(
    basisPoints: number,
): string {
    return `${(basisPoints / 100).toFixed(2)}%`;
}

function DetailRow({
    label,
    value,
}: {
    readonly label: string;
    readonly value: string;
}) {
    return (
        <div className="flex items-center justify-between gap-4 py-3">
            <p className="text-sm text-muted-foreground">
                {label}
            </p>

            <p className="text-right text-sm font-medium tabular-nums">
                {value}
            </p>
        </div>
    );
}

function AccountAddress({
    address,
}: {
    readonly address: string;
}) {
    const [
        copied,
        setCopied,
    ] = useState(false);

    async function copyAddress():
        Promise<void> {
        try {
            await navigator.clipboard.writeText(
                address,
            );

            setCopied(true);

            window.setTimeout(
                () => {
                    setCopied(false);
                },
                1_500,
            );
        } catch (error) {
            diagnostics.warn(
                "account.address_copy_failed",
                error,
            );
        }
    }

    return (
        <div className="py-3">
            <p className="text-sm text-muted-foreground">
                Account address
            </p>

            <div className="mt-2 flex items-center justify-between gap-3">
                <code className="text-sm tabular-nums">
                    {shortAddress(address)}
                </code>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        void copyAddress();
                    }}
                >
                    {copied ? (
                        <>
                            <Check className="size-4" />
                            Copied
                        </>
                    ) : (
                        <>
                            <Copy className="size-4" />
                            Copy
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}

const USDC_SCALE =
    1_000_000n;

function formatTransactionAmount(
    amountAtomic: string,
    asset: string,
): string {
    if (asset !== "USDC") {
        return `${amountAtomic} ${asset}`;
    }

    const amount =
        BigInt(amountAtomic);

    const whole =
        amount / USDC_SCALE;

    const fractional =
        amount % USDC_SCALE;

    const cents =
        (
            fractional
            * 100n
            / USDC_SCALE
        )
            .toString()
            .padStart(2, "0");

    return `$${whole}.${cents}`;
}

function transactionLabel(
    type: TransactionType,
): string {
    switch (type) {
        case "fiat_funding":
            return "Added funds";

        case "crypto_funding":
            return "Crypto deposit";

        case "savings_deposit":
            return "Savings deposit";

        case "savings_withdrawal":
            return "Savings withdrawal";

        case "crypto_withdrawal":
            return "Crypto withdrawal";

        case "fiat_withdrawal":
            return "Bank withdrawal";

        case "reward":
            return "Commitment reward";
    }
}

function isIncomingTransaction(
    type: TransactionType,
): boolean {
    return (
        type === "fiat_funding"
        || type === "crypto_funding"
        || type === "reward"
    );
}

function TransactionIcon({
    transaction,
}: {
    readonly transaction:
    TransactionDto;
}) {
    if (
        transaction.type
        === "reward"
    ) {
        return (
            <Gift
                className="size-4"
            />
        );
    }

    return isIncomingTransaction(
        transaction.type,
    ) ? (
        <ArrowDownLeft
            className="size-4"
        />
    ) : (
        <ArrowUpRight
            className="size-4"
        />
    );
}

function formatTransactionDate(
    value: string,
): string {
    return new Intl.DateTimeFormat(
        undefined,
        {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        },
    ).format(
        new Date(value),
    );
}

export function AccountPage({
    session,
}: {
    readonly session: Session;
}) {
    const navigate =
        useNavigate();

    const wallet =
        useKeptEvmWallet();

    const [
        signOutPending,
        setSignOutPending,
    ] = useState(false);

    const [
        signOutError,
        setSignOutError,
    ] = useState<string | null>(
        null,
    );

    const [
        transparency,
        setTransparency,
    ] = useState<
        SavingsTransparency | null
    >(null);

    const [
        transparencyLoading,
        setTransparencyLoading,
    ] = useState(true);

    const [
        marketStatus,
        setMarketStatus,
    ] = useState<
        SavingsMarketStatusDto | null
    >(null);

    const [
        marketLoading,
        setMarketLoading,
    ] = useState(true);

    const [
        transactions,
        setTransactions,
    ] = useState<
        readonly TransactionDto[]
    >([]);

    const [
        transactionsLoading,
        setTransactionsLoading,
    ] = useState(true);

    const [
        transactionsError,
        setTransactionsError,
    ] = useState<
        string | null
    >(null);

    const apiBaseUrl =
        useMemo(
            () =>
                readApiBaseUrl(
                    import.meta.env,
                ),
            [],
        );

    const api =
        useMemo(
            () =>
                apiBaseUrl
                    ? createKeptApi({
                        baseUrl:
                            apiBaseUrl,

                        getAccessToken:
                            session
                                .getAccessToken,
                    })
                    : null,
            [
                apiBaseUrl,
                session.getAccessToken,
            ],
        );

    useEffect(() => {
        let cancelled =
            false;

        void readSavingsTransparency()
            .then((result) => {
                if (!cancelled) {
                    setTransparency(
                        result,
                    );
                }
            })
            .catch((error) => {
                diagnostics.warn(
                    "account.transparency_failed",
                    error,
                );

                if (!cancelled) {
                    setTransparency(
                        null,
                    );
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setTransparencyLoading(
                        false,
                    );
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled =
            false;

        if (!api) {
            return;
        }

        void api
            .getSavingsMarketStatus()
            .then((status) => {
                if (!cancelled) {
                    setMarketStatus(
                        status,
                    );
                }
            })
            .catch((error) => {
                diagnostics.warn(
                    "account.market_status_failed",
                    error,
                );

                if (!cancelled) {
                    setMarketStatus(
                        null,
                    );
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setMarketLoading(
                        false,
                    );
                }
            });

        return () => {
            cancelled = true;
        };
    }, [api]);

    useEffect(() => {
        let cancelled =
            false;

        if (!api) {
            return;
        }

        void api
            .listTransactions()
            .then((result) => {
                if (!cancelled) {
                    setTransactions(
                        result,
                    );
                }
            })
            .catch((error) => {
                diagnostics.warn(
                    "account.transactions_failed",
                    error,
                );

                if (!cancelled) {
                    setTransactions([]);

                    setTransactionsError(
                        consumerErrorMessage(
                            error,
                            "We couldn't load your transaction history.",
                        ),
                    );
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setTransactionsLoading(
                        false,
                    );
                }
            });

        return () => {
            cancelled = true;
        };
    }, [api]);

    async function signOut():
        Promise<void> {
        setSignOutPending(true);
        setSignOutError(null);

        try {
            await session.logout();
        } catch (error) {
            diagnostics.error(
                "auth.sign_out_failed",
                error,
            );

            setSignOutError(
                consumerErrorMessage(
                    error,
                    "We couldn't sign you out. Try again.",
                ),
            );
        } finally {
            setSignOutPending(false);
        }
    }

    return (
        <AppShell
            headerAction={
                <AccountMenu
                    onOpenAccount={() => {
                        navigate("/account");
                    }}
                    onSignOut={
                        session.logout
                    }
                />
            }
        >
            <div className="mx-auto w-full max-w-5xl space-y-8">
                <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3 gap-2 text-muted-foreground"
                    onClick={() => {
                        navigate(
                            "/dashboard",
                        );
                    }}
                >
                    <ArrowLeft className="size-4" />
                    Dashboard
                </Button>

                <section>
                    <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                        My Account
                    </h1>

                    <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                        Manage your account and
                        see the important details
                        behind your Kept savings.
                    </p>
                </section>

                <div className="grid gap-6 md:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <UserRound className="size-4" />
                                Account
                            </CardTitle>
                        </CardHeader>

                        <CardContent className="divide-y">
                            <DetailRow
                                label="Email"
                                value={
                                    session.email
                                    ?? "Unavailable"
                                }
                            />

                            <DetailRow
                                label="Sign-in method"
                                value="Email"
                            />

                            <div className="flex items-center justify-between gap-4 py-4">
                                <div>
                                    <p className="text-sm font-medium">
                                        Sign out
                                    </p>

                                    <p className="mt-1 text-xs text-muted-foreground">
                                        End your current
                                        Kept session.
                                    </p>
                                </div>

                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={
                                        signOutPending
                                    }
                                    onClick={() => {
                                        void signOut();
                                    }}
                                >
                                    <LogOut className="size-4" />

                                    {signOutPending
                                        ? "Signing out…"
                                        : "Sign out"}
                                </Button>
                            </div>

                            {signOutError ? (
                                <p
                                    className="py-3 text-sm text-destructive"
                                    role="alert"
                                >
                                    {signOutError}
                                </p>
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <WalletCards className="size-4" />
                                Kept account
                            </CardTitle>
                        </CardHeader>

                        <CardContent className="divide-y">
                            {wallet.address ? (
                                <AccountAddress
                                    address={
                                        wallet.address
                                    }
                                />
                            ) : (
                                <DetailRow
                                    label="Account address"
                                    value="Account not ready"
                                />
                            )}

                            {transparencyLoading ? (
                                <div className="space-y-3 py-4">
                                    <Skeleton className="h-5 w-full" />
                                    <Skeleton className="h-5 w-full" />
                                </div>
                            ) : transparency ? (
                                <>
                                    <DetailRow
                                        label="Network"
                                        value={
                                            transparency
                                                .networkName
                                        }
                                    />

                                    <DetailRow
                                        label="Savings asset"
                                        value={
                                            transparency
                                                .savingsAsset
                                        }
                                    />
                                </>
                            ) : (
                                <p className="py-4 text-sm text-muted-foreground">
                                    Account details are
                                    currently unavailable.
                                </p>
                            )}

                            <p className="py-4 text-xs leading-5 text-muted-foreground">
                                Kept manages this
                                account behind the
                                scenes during normal
                                use.
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">
                                Savings details
                            </CardTitle>
                        </CardHeader>

                        <CardContent className="divide-y">
                            <DetailRow
                                label="Yield source"
                                value="Aave"
                            />

                            {transparencyLoading ? (
                                <div className="space-y-3 py-4">
                                    <Skeleton className="h-5 w-full" />
                                    <Skeleton className="h-5 w-full" />
                                </div>
                            ) : transparency ? (
                                <>
                                    <DetailRow
                                        label="Deposit fee"
                                        value={
                                            transparency.depositFeeBps !== null
                                                ? formatBps(
                                                    transparency.depositFeeBps,
                                                )
                                                : "Unavailable"
                                        }
                                    />

                                    <DetailRow
                                        label="Performance fee"
                                        value={
                                            transparency.performanceFeeBps !== null
                                                ? `${formatBps(
                                                    transparency.performanceFeeBps,
                                                )} of earnings`
                                                : "Unavailable"
                                        }
                                    />
                                </>
                            ) : null}

                            {marketLoading ? (
                                <div className="py-4">
                                    <Skeleton className="h-5 w-full" />
                                </div>
                            ) : marketStatus ? (
                                <DetailRow
                                    label="Current APY"
                                    value={`${(
                                        Number(
                                            marketStatus
                                                .netApyBps,
                                        )
                                        / 100
                                    ).toFixed(2)}%`}
                                />
                            ) : (
                                <DetailRow
                                    label="Current APY"
                                    value="Unavailable"
                                />
                            )}

                            <div className="py-4">
                                <p className="text-xs leading-5 text-muted-foreground">
                                    Yield is variable.
                                    Current APY is shown
                                    after Kept's
                                    performance fee.
                                    More technical
                                    information about
                                    contracts, liquidity,
                                    custody and protocol
                                    risk will be available
                                    in Kept Docs.
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <ShieldCheck className="size-4" />
                                Privacy & information
                            </CardTitle>
                        </CardHeader>

                        <CardContent className="divide-y p-0">
                            <Button
                                render={<Link to="/privacy" />}
                                variant="ghost"
                                className="h-auto w-full justify-between rounded-none px-6 py-4 font-normal"
                            >
                                <div className="text-left">
                                    <p className="text-sm font-medium">
                                        Privacy policy
                                    </p>

                                    <p className="mt-1 text-xs text-muted-foreground">
                                        How Kept handles
                                        your information.
                                    </p>
                                </div>

                                <ExternalLink className="size-4 text-muted-foreground" />
                            </Button>

                            <Button
                                render={<Link to="/terms" />}
                                variant="ghost"
                                className="h-auto w-full justify-between rounded-none px-6 py-4 font-normal"
                            >
                                <div className="text-left">
                                    <p className="text-sm font-medium">
                                        Terms of service
                                    </p>

                                    <p className="mt-1 text-xs text-muted-foreground">
                                        The terms that
                                        apply when using
                                        Kept.
                                    </p>
                                </div>

                                <ExternalLink className="size-4 text-muted-foreground" />
                            </Button>

                            <Button
                                render={<Link to="/verification" />}
                                variant="ghost"
                                className="h-auto w-full justify-between rounded-none px-6 py-4 font-normal"
                            >
                                <div className="text-left">
                                    <p className="text-sm font-medium">
                                        Verification
                                    </p>

                                    <p className="mt-1 text-xs text-muted-foreground">
                                        How commitments
                                        are verified.
                                    </p>
                                </div>

                                <ExternalLink className="size-4 text-muted-foreground" />
                            </Button>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle
                            className="
        flex
        items-center
        gap-2
        text-base
      "
                        >
                            <History
                                className="size-4"
                            />

                            Transaction history
                        </CardTitle>
                    </CardHeader>

                    <CardContent>
                        {transactionsLoading ? (
                            <div
                                className="
          space-y-4
        "
                            >
                                <Skeleton
                                    className="h-14 w-full"
                                />

                                <Skeleton
                                    className="h-14 w-full"
                                />

                                <Skeleton
                                    className="h-14 w-full"
                                />
                            </div>
                        ) : transactionsError ? (
                            <p
                                className="
          text-sm
          text-muted-foreground
        "
                                role="alert"
                            >
                                {transactionsError}
                            </p>
                        ) : transactions.length
                            === 0 ? (
                            <div
                                className="
          py-8
          text-center
        "
                            >
                                <History
                                    className="
            mx-auto
            size-5
            text-muted-foreground
          "
                                />

                                <p
                                    className="
            mt-3
            text-sm
            font-medium
          "
                                >
                                    No transactions yet
                                </p>

                                <p
                                    className="
            mt-1
            text-sm
            text-muted-foreground
          "
                                >
                                    Your Kept activity
                                    will appear here.
                                </p>
                            </div>
                        ) : (
                            <div
                                className="
          divide-y
        "
                            >
                                {transactions.map(
                                    (transaction) => (
                                        <div
                                            key={
                                                transaction.id
                                            }
                                            className="
                flex
                items-center
                gap-4
                py-4
                first:pt-0
                last:pb-0
              "
                                        >
                                            <div
                                                className="
                  flex
                  size-9
                  shrink-0
                  items-center
                  justify-center
                  rounded-full
                  bg-muted
                "
                                            >
                                                <TransactionIcon
                                                    transaction={
                                                        transaction
                                                    }
                                                />
                                            </div>

                                            <div
                                                className="
                  min-w-0
                  flex-1
                "
                                            >
                                                <div
                                                    className="
                    flex
                    items-start
                    justify-between
                    gap-4
                  "
                                                >
                                                    <div
                                                        className="
                      min-w-0
                    "
                                                    >
                                                        <p
                                                            className="
                        truncate
                        text-sm
                        font-medium
                      "
                                                        >
                                                            {
                                                                transaction
                                                                    .description
                                                            }
                                                        </p>

                                                        <p
                                                            className="
                        mt-1
                        text-xs
                        text-muted-foreground
                      "
                                                        >
                                                            {transactionLabel(
                                                                transaction
                                                                    .type,
                                                            )}

                                                            {" · "}

                                                            {
                                                                transaction
                                                                    .status
                                                            }
                                                        </p>
                                                    </div>

                                                    <p
                                                        className="
                      shrink-0
                      text-sm
                      font-semibold
                      tabular-nums
                    "
                                                    >
                                                        {isIncomingTransaction(
                                                            transaction
                                                                .type,
                                                        )
                                                            ? "+"
                                                            : "-"}

                                                        {formatTransactionAmount(
                                                            transaction
                                                                .amountAtomic,
                                                            transaction
                                                                .asset,
                                                        )}
                                                    </p>
                                                </div>

                                                <p
                                                    className="
                    mt-1
                    text-xs
                    text-muted-foreground
                  "
                                                >
                                                    {formatTransactionDate(
                                                        transaction
                                                            .createdAt,
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    ),
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppShell>
    );
}