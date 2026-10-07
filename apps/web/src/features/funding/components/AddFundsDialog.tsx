import {
    useCallback,
    useState,
} from "react";

import {
    useKeptEvmWallet,
} from "@/wallet/evm-wallet";

import {
    AddFundsChoiceView,
} from "@/features/funding/components/AddFundsChoiceView";

import {
    AddFundsCryptoView,
} from "@/features/funding/components/AddFundsCryptoView";

import {
    Dialog,
    DialogContent,
} from "@/components/ui/dialog";

import {
    useExternalFundingWallet,
} from "@/features/funding/use-external-funding-wallet";

import {
    useFundingSourceController,
} from "@/features/funding/use-funding-source-controller";

import {
    useFundingPreviewController,
} from "@/features/funding/use-funding-preview-controller";

import {
    useFundingExecutionController,
} from "@/features/funding/use-funding-execution-controller";

import {
    useFiatFundingController,
} from "@/features/funding/use-fiat-funding-controller";

type FundingView =
    | "choose"
    | "crypto";

interface AddFundsDialogProps {
    readonly open:
    boolean;

    readonly walletAddress:
    string | null;

    readonly fiatEnabled:
    boolean;

    readonly readSolanaFundingBalances:
    (
        owner: string,
    ) => Promise<{
        readonly nativeBalance: string;
        readonly balances: Readonly<Record<string, string>>;
    }>;

    readonly onOpenChange: (
        open: boolean,
    ) => void;

    readonly onUseAvailableCash:
    () => void;
}

export function AddFundsDialog({
    open,
    walletAddress,
    fiatEnabled,
    readSolanaFundingBalances,
    onOpenChange,
    onUseAvailableCash,
}: AddFundsDialogProps) {
    const [
        view,
        setView,
    ] =
        useState<FundingView>(
            "choose",
        );

    const wallet =
        useKeptEvmWallet();

    const externalWallet =
        useExternalFundingWallet();


    const {
        executing,
        executionStatus,
        executionError,
        executeEmbeddedFunding,
        executeExternalFunding,
        clearExecutionFeedback,
        resetExecution,
    } = useFundingExecutionController();

    const {
        fiatStatus,
        fiatError,
        handleFiatStarted,
        handleFiatSubmitted,
        handleFiatConfirmed,
        handleFiatError,
        resetFiat,
    } = useFiatFundingController({
        walletAddress,
        wallet,
        executeEmbeddedFunding,
    });

    const {
        amount: cryptoAmount,
        previewing,
        previewStatus,
        previewError,
        previewedAmount:
            previewedCryptoAmount,
        previewDetails,
        setAmount:
            setCryptoAmount,
        invalidatePreview:
            invalidateCryptoPreview,
        preview:
            previewFundingRoute,
        resetPreview,
    } = useFundingPreviewController({
        clearExecutionFeedback,
    });

    const {
        destinationAsset,
        sourceBlockchain,
        switchingSourceNetwork,
        sourceNetworkError,
        sourceAsset,
        sourceAssetBalances,
        sourceAssetBalancesLoading,
        sourceAssetsLoading,
        sourceAssetsError,
        availableSourceBlockchains,
        filteredSourceAssets,
        changeSourceNetwork,
        selectSourceAsset,
        resetSource,
    } = useFundingSourceController({
        active:
            open &&
            view ===
                "crypto",
        externalWallet,
        readSolanaFundingBalances,
        invalidatePreview:
            () => {
                invalidateCryptoPreview();
            },
        clearAmount:
            () => {
                setCryptoAmount(
                    "",
                );
            },
    });

    const resetDialogState =
        useCallback(
            () => {
                setView(
                    "choose",
                );

                resetPreview();

                resetFiat();

                resetExecution();

                resetSource();
            },
            [
                resetExecution,
                resetFiat,
                resetPreview,
                resetSource,
            ],
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
                    <AddFundsChoiceView
                        walletAddress={
                            walletAddress
                        }

                        fiatEnabled={
                            fiatEnabled
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

                        onFiatSubmitted={
                            handleFiatSubmitted
                        }

                        onFiatConfirmed={() => {
                            void handleFiatConfirmed();
                        }}

                        onFiatError={handleFiatError}

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
                    <AddFundsCryptoView
                        walletAddress={
                            walletAddress
                        }

                        externalWalletConnected={
                            externalWallet.connected
                        }

                        externalWalletAddress={
                            externalWallet.address
                        }

                        externalWalletClientType={
                            externalWallet.walletClientType
                        }

                        externalWalletFamily={
                            externalWallet.family
                        }

                        availableExternalWallets={
                            externalWallet.availableWallets
                        }

                        sourceBlockchains={
                            availableSourceBlockchains
                        }

                        sourceBlockchain={
                            sourceBlockchain
                        }

                        sourceNetworkError={
                            sourceNetworkError
                        }

                        switchingSourceNetwork={
                            switchingSourceNetwork
                        }

                        onSourceNetworkChange={(
                            blockchain,
                        ) => {
                            void changeSourceNetwork(
                                blockchain,
                            );
                        }}

                        sourceAssets={
                            filteredSourceAssets
                        }

                        sourceAsset={
                            sourceAsset
                        }

                        destinationAsset={
                            destinationAsset
                        }

                        previewDetails={
                            previewDetails
                        }

                        sourceAssetsLoading={
                            sourceAssetsLoading
                        }

                        sourceAssetsError={
                            sourceAssetsError
                        }

                        sourceAssetBalances={
                            sourceAssetBalances
                        }

                        sourceAssetBalancesLoading={
                            sourceAssetBalancesLoading
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

                        onSelectExternalWallet={(address, family) => {
                            invalidateCryptoPreview();

                            externalWallet.select(
                                address,
                                family,
                            );
                        }}

                        onChangeExternalWallet={() => {
                            invalidateCryptoPreview();

                            externalWallet.clearSelection();
                        }}

                        onConnectExternalWallet={(family) => {
                            invalidateCryptoPreview();

                            void externalWallet.connect(
                                family,
                            );
                        }}

                        onSourceAssetChange={(
                            assetId,
                        ) => {
                            invalidateCryptoPreview();

                            setCryptoAmount(
                                "",
                            );

                            selectSourceAsset(
                                assetId,
                            );
                        }}

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
                            void previewFundingRoute({
                                walletAddress,
                                externalWallet,
                                sourceAsset,
                            });
                        }}

                        onExecute={() => {
                            if (
                                previewedCryptoAmount ===
                                null
                            ) {
                                return;
                            }

                            void executeExternalFunding({
                                amount:
                                    previewedCryptoAmount,
                                walletAddress,
                                externalWallet,
                                sourceAsset,
                            });
                        }}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

