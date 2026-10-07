import type {
  createExecutionRunner,
} from "@aurora-is-near/intents-connect";

import {
  diagnostics,
} from "@/lib/diagnostics";

import {
  createKeptFundingPlan,
} from "@/features/funding/intents/core/kept-funding-plan";
import type {
  FundingAsset,
  FundingAssetsResolver,
} from "@/features/funding/intents/core/funding-assets";

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

  readonly resolveFundingAssets:
  FundingAssetsResolver;
}

export async function previewKeptFunding({
  runner,
  amount,
  walletAddress,
  sourceAsset,
  resolveFundingAssets,
}: PreviewKeptFundingInput) {
  try {
    const plan =
      await createKeptFundingPlan({
        amount,
        walletAddress,
        sourceAsset,
        resolveFundingAssets,
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