import {
    useCallback,
    useState,
} from "react";

import type {
    KeptEvmWallet,
} from "@/chain/evm-wallet";
import {
    readBaseUsdcBalance,
} from "@/features/funding/base-usdc";
import {
    waitForBaseUsdcIncrease,
} from "@/features/funding/reconcile-base-usdc";
import {
    diagnostics,
} from "@/lib/diagnostics";

interface UseFiatFundingControllerInput {
    readonly walletAddress:
    string | null;

    readonly wallet:
    KeptEvmWallet;

    readonly executeEmbeddedFunding:
    (input: {
        readonly amount: bigint;
        readonly walletAddress: string | null;
        readonly wallet: KeptEvmWallet;
    }) => Promise<boolean>;
}

export function useFiatFundingController({
    walletAddress,
    wallet,
    executeEmbeddedFunding,
}: UseFiatFundingControllerInput) {
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

    const handleFiatSubmitted =
        useCallback(
            () => {
                setFiatStatus(
                    "Your purchase is being processed…",
                );
            },
            [],
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
                        await executeEmbeddedFunding({
                            amount:
                                received,
                            walletAddress,
                            wallet,
                        });

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
                wallet,
                walletAddress,
            ],
        );

    const resetFiat =
        useCallback(
            () => {
                setFiatStartingBalance(
                    null,
                );

                setFiatStatus(
                    null,
                );

                setFiatError(
                    null,
                );
            },
            [],
        );

    return {
        fiatStatus,
        fiatError,
        handleFiatStarted,
        handleFiatSubmitted,
        handleFiatConfirmed,
        handleFiatError,
        resetFiat,
    };
}
