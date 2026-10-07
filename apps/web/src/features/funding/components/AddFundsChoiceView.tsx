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
  BASE_USDC,
} from "@/features/funding/intents/kept-funding-recipe";

import {
  PrivyFundingButton,
} from "@/features/funding/components/PrivyFundingButton";

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
    <div className="space-y-6">
      <div>
        <h2 className="text-h2 font-semibold tracking-tight">
          Add money
        </h2>

        <p className="mt-2 text-caption text-muted-foreground">
          Choose where the money is coming from.
        </p>
      </div>

      <div className="space-y-3">
        <FundingOption
          icon={<WalletCards className="size-4" />}
          title="Available cash"
          description="Move money already in your Kept account into savings."
          meta="Instant"
        >
          <Button
            type="button"
            className="w-full"
            disabled={executing}
            onClick={onUseAvailableCash}
          >
            Use available cash
          </Button>
        </FundingOption>

        <FundingOption
          icon={<ArrowRight className="size-4" />}
          title="Crypto wallet"
          description="Transfer a supported asset from another wallet."
          meta="Supported EVM & Solana assets"
        >
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={!walletAddress || executing}
            onClick={onTransferCrypto}
          >
            Transfer crypto
          </Button>
        </FundingOption>

        <FundingOption
          icon={<Landmark className="size-4" />}
          title={fiatEnabled ? "Card or bank" : "Card or bank — Coming soon"}
          description="Buy USDC through Kept's payment partner."
          meta={fiatEnabled ? "Minimum 20" : "Fiat funding disabled"}
        >
          {!fiatEnabled ? (
            <Button
              className="w-full"
              disabled
            >
              Coming soon
            </Button>
          ) : walletAddress ? (
            <PrivyFundingButton
              address={walletAddress}
              asset={BASE_USDC}
              chain={BASE_CHAIN}
              defaultAmount={String(MIN_FIAT_ONRAMP)}
              onStarted={onFiatStarted}
              onSubmitted={onFiatSubmitted}
              onConfirmed={onFiatConfirmed}
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
            <p className="mt-3 text-caption text-muted-foreground">
              {fiatStatus}
            </p>
          ) : null}

          {fiatError ? (
            <p
              className="mt-3 text-caption text-destructive"
              role="alert"
            >
              {fiatError}
            </p>
          ) : null}

          {executionStatus ? (
            <p className="mt-3 text-caption text-muted-foreground">
              {executionStatus}
            </p>
          ) : null}

          {executionError ? (
            <p
              className="mt-3 text-caption text-destructive"
              role="alert"
            >
              {executionError}
            </p>
          ) : null}

          {executing ? (
            <p className="mt-3 text-caption text-muted-foreground">
              Keep this window open while Kept finishes adding your money.
            </p>
          ) : null}
        </FundingOption>
      </div>
    </div>
  );
}

function FundingOption({
  icon,
  title,
  description,
  meta,
  children,
}: {
  readonly icon:
  ReactNode;

  readonly title:
  string;

  readonly description:
  string;

  readonly meta:
  string;

  readonly children:
  ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <p className="text-label font-medium">
              {title}
            </p>

            <span className="text-caption text-muted-foreground">
              {meta}
            </span>
          </div>

          <p className="mt-1 text-caption text-muted-foreground">
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
