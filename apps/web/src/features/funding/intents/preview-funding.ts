import type {
  createExecutionRunner,
} from "@aurora-is-near/intents-connect";

import {
  diagnostics,
} from "@/lib/diagnostics";

import {
  createKeptFundingPlan,
} from "./kept-funding-plan";
import type { FundingAsset } from "./supported-tokens";

type ExecutionRunner =
  ReturnType<
    typeof createExecutionRunner
  >;

interface PreviewKeptFundingInput {
  readonly runner:
  ExecutionRunner;

  readonly amount:
  bigint;

  readonly walletAddress:
  string;

  readonly sourceAsset:
  FundingAsset;
}

export async function previewKeptFunding({
  runner,
  amount,
  walletAddress,
  sourceAsset
}: PreviewKeptFundingInput) {
  try {
    const plan =
      await createKeptFundingPlan({
        amount,
        walletAddress,
        sourceAsset,
      });

    const preview =
      await runner.preview(
        plan,
      );

    diagnostics.info(
      "funding.intents_preview_ready",
      {
        amount:
          amount.toString(),
      },
    );

    return {
      plan,
      preview,
    };
  } catch (cause) {
    diagnostics.error(
      "funding.intents_preview_failed",
      cause,
    );

    throw cause;
  }
}