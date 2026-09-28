import type {
  createExecutionRunner,
} from "@aurora-is-near/intents-connect";

import {
  diagnostics,
} from "@/lib/diagnostics";

import {
  createKeptFundingPlan,
} from "./kept-funding-plan";

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
}

export async function previewKeptFunding({
  runner,
  amount,
  walletAddress,
}: PreviewKeptFundingInput) {
  try {
    const plan =
      await createKeptFundingPlan({
        amount,
        walletAddress,
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