import {
  executeKeptFunding as executeApplicationKeptFunding,
} from "@/features/funding/intents/core/execute-funding";
import {
  resolveKeptFundingAssets,
} from "@/features/funding/intents/supported-tokens";

type ExecuteKeptFundingInput =
  Omit<
    Parameters<
      typeof executeApplicationKeptFunding
    >[0],
    "resolveFundingAssets"
  >;

export function executeKeptFunding(
  input: ExecuteKeptFundingInput,
) {
  return executeApplicationKeptFunding({
    ...input,
    resolveFundingAssets:
      resolveKeptFundingAssets,
  });
}
