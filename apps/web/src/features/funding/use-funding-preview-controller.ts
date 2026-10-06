import {
    useCallback,
    useState,
} from "react";
import {
    parseUnits,
} from "viem";

import {
    readChainId,
    restoreChain,
    switchToFundingChain,
} from "@/features/funding/evm-funding-network";
import {
    fundingTransferErrorMessage,
} from "@/features/funding/funding-transfer-error";
import {
    previewKeptFunding,
} from "@/features/funding/intents/preview-funding";
import {
    createKeptIntentsRunner,
} from "@/features/funding/intents/runner";
import type {
    FundingAsset,
} from "@/features/funding/intents/supported-tokens";
import type {
    ExternalFundingWallet,
} from "@/features/funding/use-external-funding-wallet";
import {
    diagnostics,
} from "@/lib/diagnostics";

export interface FundingPreviewDetails {
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

interface PreviewFundingRouteInput {
    readonly walletAddress:
    string | null;

    readonly externalWallet:
    ExternalFundingWallet;

    readonly sourceAsset:
    FundingAsset | null;
}

interface UseFundingPreviewControllerInput {
    readonly clearExecutionFeedback:
    () => void;
}

export function useFundingPreviewController({
    clearExecutionFeedback,
}: UseFundingPreviewControllerInput) {
    const [
        amount,
        setAmount,
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
        previewedAmount,
        setPreviewedAmount,
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

    const invalidatePreview =
        useCallback(
            () => {
                setPreviewedAmount(
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

                clearExecutionFeedback();
            },
            [
                clearExecutionFeedback,
            ],
        );

    const resetPreview =
        useCallback(
            () => {
                setAmount(
                    "",
                );

                invalidatePreview();
            },
            [
                invalidatePreview,
            ],
        );

    const preview =
        useCallback(
            async ({
                walletAddress,
                externalWallet,
                sourceAsset,
            }: PreviewFundingRouteInput) => {
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

                let parsedAmount:
                    bigint;

                try {
                    parsedAmount =
                        parseUnits(
                            amount,
                            sourceAsset.decimals,
                        );
                } catch {
                    setPreviewError(
                        `Enter a valid ${sourceAsset.symbol} amount.`,
                    );

                    return;
                }

                if (
                    parsedAmount <=
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

                setPreviewedAmount(
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
                        family ===
                            "evm"
                            ? await externalWallet
                                .getEvmProvider()
                            : null;

                    const solanaProvider =
                        family ===
                            "sol"
                            ? await externalWallet
                                .getSolanaProvider()
                            : null;

                    if (
                        family ===
                            "evm"
                        && !evmProvider
                    ) {
                        throw new Error(
                            "Connected wallet provider is unavailable.",
                        );
                    }

                    if (
                        family ===
                            "sol"
                        && !solanaProvider
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
                        family ===
                            "sol"
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
                            preview:
                                routePreview,
                        } =
                            await previewKeptFunding({
                                runner,
                                amount:
                                    parsedAmount,
                                walletAddress,
                                sourceAsset,
                            });

                        setPreviewedAmount(
                            parsedAmount,
                        );

                        setPreviewDetails({
                            amountIn:
                                routePreview.execution.quote.amountIn,
                            amountOut:
                                routePreview.execution.quote.amountOut,
                            minimumAmountOut:
                                routePreview.execution.quote.minAmountOut,
                            networkFee:
                                routePreview.execution.details.networkFee ??
                                null,
                            estimatedTime:
                                routePreview.execution.details.estimatedTime ??
                                null,
                            depositAddress:
                                routePreview.execution.quote.depositAddress,
                            intermediaryAddress:
                                routePreview.execution.details.intermediaryAddress,
                        });

                        clearExecutionFeedback();

                        setPreviewStatus(
                            "Your transfer route is ready.",
                        );
                    } finally {
                        runner.dispose();

                        if (
                            evmProvider
                            && previousChainId !==
                                null
                        ) {
                            try {
                                await restoreChain(
                                    evmProvider,
                                    previousChainId,
                                );
                            } catch (
                                restoreError
                            ) {
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
                    setPreviewedAmount(
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
                amount,
                clearExecutionFeedback,
                previewing,
            ],
        );

    return {
        amount,
        previewing,
        previewStatus,
        previewError,
        previewedAmount,
        previewDetails,
        setAmount,
        invalidatePreview,
        resetPreview,
        preview,
    };
}
