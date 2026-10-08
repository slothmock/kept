import { useCallback, useState } from "react";
import { ArrowLeft, CheckCircle2, ShieldCheck, WalletCards } from "lucide-react";

import type { AccessTokenProvider } from "@/api/http-client";
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
  readonly getAccessToken: AccessTokenProvider;
  readonly fiatEnabled: boolean;
  readonly availableCashReady: boolean;
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
  getAccessToken,
  fiatEnabled,
  availableCashReady,
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
  } = useFundingExecutionController({
    getAccessToken,
  });

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
    getAccessToken,
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
          {view === "crypto" ? "Back to Add money" : "Back to Home"}
        </Button>

        <div className="mt-4">
          <h1 className="text-h1 font-semibold tracking-tight">
            Add money
          </h1>

          <p className="mt-2 max-w-2xl text-body text-muted-foreground">
            Choose how you want to add money to your Kept account.
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)] xl:items-start">
        <Card className="shadow-none">
          <CardContent className="p-5 sm:p-6">
            {view === "choose" ? (
            <AddFundsChoiceView
              walletAddress={walletAddress}
              fiatEnabled={fiatEnabled}
              availableCashReady={availableCashReady}
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

        <aside className="space-y-4 xl:sticky xl:top-8">
          <Card className="shadow-none">
            <CardContent className="p-5">
              <p className="text-caption font-medium text-muted-foreground">
                Adding to
              </p>

              <div className="mt-3 flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                  <WalletCards className="size-4" />
                </div>

                <div className="min-w-0">
                  <p className="text-label font-semibold">
                    Your Kept account
                  </p>

                  <p className="mt-1 text-caption text-muted-foreground">
                    {walletAddress
                      ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
                      : "Preparing your embedded wallet…"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardContent className="space-y-5 p-5">
              <div className="flex items-start gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                  <CheckCircle2 className="size-4" />
                </div>

                <div>
                  <p className="text-label font-medium">
                    Review before sending
                  </p>

                  <p className="mt-1 text-caption text-muted-foreground">
                    Crypto transfers show the route and minimum receive before you confirm them.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                  <ShieldCheck className="size-4" />
                </div>

                <div>
                  <p className="text-label font-medium">
                    Your funding method stays separate
                  </p>

                  <p className="mt-1 text-caption text-muted-foreground">
                    Kept only uses the method you choose for this add-money flow.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <p className="px-1 text-caption text-muted-foreground">
            {fiatEnabled
              ? "Card or bank funding is handled through Kept's payment partner."
              : "Card or bank funding is currently unavailable."}
          </p>
        </aside>
      </div>
    </div>
  );
}
