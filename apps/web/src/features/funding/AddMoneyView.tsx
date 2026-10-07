import { useCallback, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AddFundsChoiceView } from "@/features/funding/components/AddFundsChoiceView";
import { AddFundsCryptoView } from "@/features/funding/components/AddFundsCryptoView";
import { useExternalFundingWallet } from "@/features/funding/use-external-funding-wallet";
import { useFiatFundingController } from "@/features/funding/use-fiat-funding-controller";
import { useFundingExecutionController } from "@/features/funding/use-funding-execution-controller";
import { useFundingPreviewController } from "@/features/funding/use-funding-preview-controller";
import { useFundingSourceController } from "@/features/funding/use-funding-source-controller";
import { useKeptEvmWallet } from "@/wallet/evm-wallet";

type FundingView =
  | "choose"
  | "crypto";

interface AddMoneyViewProps {
  readonly walletAddress: string | null;
  readonly fiatEnabled: boolean;
  readonly readSolanaFundingBalances: (
    owner: string,
  ) => Promise<{
    readonly nativeBalance: string;
    readonly balances: Readonly<Record<string, string>>;
  }>;
  readonly onBack: () => void;
  readonly onUseAvailableCash: () => void;
}

export function AddMoneyView({
  walletAddress,
  fiatEnabled,
  readSolanaFundingBalances,
  onBack,
  onUseAvailableCash,
}: AddMoneyViewProps) {
  const [view, setView] =
    useState<FundingView>("choose");

  const wallet = useKeptEvmWallet();
  const externalWallet = useExternalFundingWallet();

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
    previewedAmount: previewedCryptoAmount,
    previewDetails,
    setAmount: setCryptoAmount,
    invalidatePreview: invalidateCryptoPreview,
    preview: previewFundingRoute,
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
    active: view === "crypto",
    externalWallet,
    readSolanaFundingBalances,
    invalidatePreview: () => {
      invalidateCryptoPreview();
    },
    clearAmount: () => {
      setCryptoAmount("");
    },
  });

  const resetFlow = useCallback(() => {
    setView("choose");
    resetPreview();
    resetFiat();
    resetExecution();
    resetSource();
  }, [
    resetExecution,
    resetFiat,
    resetPreview,
    resetSource,
  ]);

  const handleBack = () => {
    if (view === "crypto") {
      invalidateCryptoPreview();
      setView("choose");
      return;
    }

    resetFlow();
    onBack();
  };

  return (
    <div className="space-y-8">
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-3 text-muted-foreground"
          onClick={handleBack}
          disabled={executing}
        >
          <ArrowLeft className="size-4" />
          {view === "crypto" ? "Add money" : "Home"}
        </Button>

        <div className="mt-4">
          <p className="text-caption font-medium text-primary">
            Add money
          </p>

          <h1 className="mt-2 text-h1 font-semibold tracking-tight">
            Add money to Kept.
          </h1>

          <p className="mt-2 max-w-2xl text-body text-muted-foreground">
            Use available cash, transfer crypto, or fund through Kept&apos;s payment partner.
          </p>
        </div>
      </div>

      <Card className="mx-auto w-full max-w-2xl shadow-none">
        <CardContent className="p-5 sm:p-6">
          {view === "choose" ? (
            <AddFundsChoiceView
              walletAddress={walletAddress}
              fiatEnabled={fiatEnabled}
              fiatStatus={fiatStatus}
              fiatError={fiatError}
              executionStatus={executionStatus}
              executionError={executionError}
              executing={executing}
              onFiatStarted={handleFiatStarted}
              onFiatSubmitted={handleFiatSubmitted}
              onFiatConfirmed={() => {
                void handleFiatConfirmed();
              }}
              onFiatError={handleFiatError}
              onUseAvailableCash={onUseAvailableCash}
              onTransferCrypto={() => {
                invalidateCryptoPreview();
                setView("crypto");
              }}
            />
          ) : (
            <AddFundsCryptoView
              walletAddress={walletAddress}
              externalWalletConnected={externalWallet.connected}
              externalWalletAddress={externalWallet.address}
              externalWalletClientType={externalWallet.walletClientType}
              externalWalletFamily={externalWallet.family}
              availableExternalWallets={externalWallet.availableWallets}
              sourceBlockchains={availableSourceBlockchains}
              sourceBlockchain={sourceBlockchain}
              sourceNetworkError={sourceNetworkError}
              switchingSourceNetwork={switchingSourceNetwork}
              onSourceNetworkChange={(blockchain) => {
                void changeSourceNetwork(blockchain);
              }}
              sourceAssets={filteredSourceAssets}
              sourceAsset={sourceAsset}
              destinationAsset={destinationAsset}
              previewDetails={previewDetails}
              sourceAssetsLoading={sourceAssetsLoading}
              sourceAssetsError={sourceAssetsError}
              sourceAssetBalances={sourceAssetBalances}
              sourceAssetBalancesLoading={sourceAssetBalancesLoading}
              amount={cryptoAmount}
              previewing={previewing}
              previewStatus={previewStatus}
              previewError={previewError}
              executing={executing}
              executionStatus={executionStatus}
              executionError={executionError}
              canExecute={previewedCryptoAmount !== null}
              onSelectExternalWallet={(address, family) => {
                invalidateCryptoPreview();
                externalWallet.select(address, family);
              }}
              onChangeExternalWallet={() => {
                invalidateCryptoPreview();
                externalWallet.clearSelection();
              }}
              onConnectExternalWallet={(family) => {
                invalidateCryptoPreview();
                void externalWallet.connect(family);
              }}
              onSourceAssetChange={(assetId) => {
                invalidateCryptoPreview();
                setCryptoAmount("");
                selectSourceAsset(assetId);
              }}
              onAmountChange={setCryptoAmount}
              onPreviewInvalidated={invalidateCryptoPreview}
              onBack={() => {
                invalidateCryptoPreview();
                setView("choose");
              }}
              onPreviewRoute={() => {
                void previewFundingRoute({
                  walletAddress,
                  externalWallet,
                  sourceAsset,
                });
              }}
              onExecute={() => {
                if (previewedCryptoAmount === null) {
                  return;
                }

                void executeExternalFunding({
                  amount: previewedCryptoAmount,
                  walletAddress,
                  externalWallet,
                  sourceAsset,
                });
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
