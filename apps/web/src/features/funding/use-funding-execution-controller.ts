import {
    useCallback,
    useState,
} from "react";

import type {
    KeptEvmWallet,
} from "@/chain/evm-wallet";
import {
    readChainId,
    restoreChain,
    switchToFundingChain,
} from "@/features/funding/evm-funding-network";
import {
    executeKeptFunding,
} from "@/features/funding/execute-funding";
import {
    fundingTransferErrorMessage,
} from "@/features/funding/funding-transfer-error";
import {
    createKeptIntentsRunner,
} from "@/features/funding/intents/runner";
import {
    resolveKeptFundingAssets,
    type FundingAsset,
} from "@/features/funding/intents/supported-tokens";
import type {
    ExternalFundingWallet,
} from "@/features/funding/use-external-funding-wallet";
import {
    diagnostics,
} from "@/lib/diagnostics";

interface ExecuteEmbeddedFundingInput {
    readonly amount:
    bigint;

    readonly walletAddress:
    string | null;

    readonly wallet:
    KeptEvmWallet;
}

interface ExecuteExternalFundingInput {
    readonly amount:
    bigint;

    readonly walletAddress:
    string | null;

    readonly externalWallet:
    ExternalFundingWallet;

    readonly sourceAsset:
    FundingAsset | null;
}

export function useFundingExecutionController() {
    const [
        executing,
        setExecuting,
    ] =
        useState(false);

    const [
        executionStatus,
        setExecutionStatus,
    ] =
        useState<
            string | null
        >(null);

    const [
        executionError,
        setExecutionError,
    ] =
        useState<
            string | null
        >(null);

    const clearExecutionFeedback =
        useCallback(
            () => {
                setExecutionStatus(
                    null,
                );

                setExecutionError(
                    null,
                );
            },
            [],
        );

    const resetExecution =
        useCallback(
            () => {
                setExecuting(
                    false,
                );

                clearExecutionFeedback();
            },
            [
                clearExecutionFeedback,
            ],
        );

    const executeEmbeddedFunding =
        useCallback(
            async ({
                amount,
                walletAddress,
                wallet,
            }: ExecuteEmbeddedFundingInput):
                Promise<boolean> => {
                if (
                    !walletAddress ||
                    !wallet.address ||
                    executing
                ) {
                    return false;
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
                    const {
                        origins,
                    } =
                        await resolveKeptFundingAssets();

                    const fiatSourceAsset =
                        origins.find(
                            (
                                asset,
                            ) =>
                                asset.blockchain ===
                                    "base"
                                && asset.symbol ===
                                    "USDC",
                        );

                    if (
                        !fiatSourceAsset
                    ) {
                        throw new Error(
                            "Base USDC is not currently supported by Aurora Intents.",
                        );
                    }

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

                    await switchToFundingChain(
                        provider,
                        "base",
                    );

                    const runner =
                        createKeptIntentsRunner({
                            sourceAddress:
                                wallet.address,
                            family:
                                "evm",
                            provider,
                        });

                    try {
                        await executeKeptFunding({
                            runner,
                            amount,
                            walletAddress,
                            sourceAsset:
                                fiatSourceAsset,
                        });

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

                        return true;
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
                            diagnostics.warn(
                                "funding.wallet_network_restore_failed",
                                restoreError,
                            );
                        }
                    }
                } catch (
                    error
                ) {
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

                    return false;
                } finally {
                    setExecuting(
                        false,
                    );
                }
            },
            [
                executing,
            ],
        );

    const executeExternalFunding =
        useCallback(
            async ({
                amount,
                walletAddress,
                externalWallet,
                sourceAsset,
            }: ExecuteExternalFundingInput):
                Promise<boolean> => {
                if (
                    !walletAddress ||
                    !externalWallet.address ||
                    !sourceAsset ||
                    executing
                ) {
                    return false;
                }

                setExecuting(
                    true,
                );

                setExecutionStatus(
                    "Waiting for your wallet…",
                );

                setExecutionError(
                    null,
                );

                try {
                    const family =
                        externalWallet.family;

                    if (
                        !family
                    ) {
                        throw new Error(
                            "Connect a wallet to continue.",
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
                        await executeKeptFunding({
                            runner,
                            amount,
                            walletAddress,
                            sourceAsset,
                        });

                        setExecutionStatus(
                            "Your money has been added to Kept.",
                        );

                        diagnostics.info(
                            "funding.external_intents_complete",
                            {
                                amount:
                                    amount.toString(),
                                sourceAsset:
                                    sourceAsset.symbol,
                                sourceChain:
                                    sourceAsset.blockchain,
                            },
                        );

                        return true;
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
                    diagnostics.error(
                        "funding.external_intents_failed",
                        error,
                    );

                    setExecutionStatus(
                        null,
                    );

                    setExecutionError(
                        fundingTransferErrorMessage(
                            error,
                            sourceAsset,
                            "We couldn't prepare your transfer.",
                        ),
                    );

                    return false;
                } finally {
                    setExecuting(
                        false,
                    );
                }
            },
            [
                executing,
            ],
        );

    return {
        executing,
        executionStatus,
        executionError,
        executeEmbeddedFunding,
        executeExternalFunding,
        clearExecutionFeedback,
        resetExecution,
    };
}
