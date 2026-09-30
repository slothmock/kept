import { useState } from "react";
import {
  useFiatOnramp,
} from "@privy-io/react-auth"

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
  readonly onError?: (message: string) => void;
}

export function PrivyFundingButton({
  address,
  asset,
  chain,
  defaultAmount = "50",
  onStarted,
  onSubmitted,
  onConfirmed,
  onError,
}: PrivyFundingButtonProps) {
  const {
    fund,
  } = useFiatOnramp();

  const [
    pending,
    setPending,
  ] = useState(false);

  async function startFunding():
    Promise<void> {
    setPending(true);

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
      const cancelled =
        cause instanceof Error &&
        cause.message ===
        "User exited flow";

      if (cancelled) {
        diagnostics.info(
          "funding.privy_cancelled",
        );

        onError?.(
          "",
        );

        return;
      }

      diagnostics.error(
        "funding.privy_failed",
        cause,
      );

      onError?.(
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
  );
}