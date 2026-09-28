import { useState } from "react";
import {
  useFiatOnramp,
} from "@privy-io/react-auth";

import { Button } from "@/components/ui/button";
import {
  consumerErrorMessage,
} from "@/lib/consumer-error";
import {
  diagnostics,
} from "@/lib/diagnostics";

interface PrivyFundingButtonProps {
  readonly address: string;
  readonly asset: string;
  readonly chain: `${string}:${string}`;
  readonly defaultAmount?: string;
  readonly onStarted?: () => Promise<void>;
  readonly onSubmitted?: () => void;
  readonly onConfirmed?: () => void;
}

export function PrivyFundingButton({
  address,
  asset,
  chain,
  defaultAmount = "50",
  onStarted,
  onSubmitted,
  onConfirmed,
}: PrivyFundingButtonProps) {
  const {
    fund,
  } = useFiatOnramp();

  const [
    pending,
    setPending,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null,
  );

  async function startFunding():
    Promise<void> {
    setPending(true);
    setError(null);

    try {
      await onStarted?.();

      const result =
        await fund({
          source: {
            assets: [
              "usd",
              "eur",
              "gbp",
            ],
            defaultAsset:
              "usd",
          },

          destination: {
            address,
            asset,
            chain,
          },

          environment:
            "production",

          defaultAmount,
        });

      diagnostics.info(
        "funding.privy_result",
        {
          status:
            result.status,
        },
      );

      if (
        result.status ===
        "submitted"
      ) {
        onSubmitted?.();
      }

      if (
        result.status ===
        "confirmed"
      ) {
        onConfirmed?.();
      }
    } catch (cause) {
      diagnostics.error(
        "funding.privy_failed",
        cause,
      );

      setError(
        consumerErrorMessage(
          cause,
          "We couldn't start funding. Try again.",
        ),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        className="w-full"
        disabled={pending}
        onClick={() => {
          void startFunding();
        }}
      >
        {pending
          ? "Starting funding…"
          : "Continue"}
      </Button>

      {error ? (
        <p
          className="text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}