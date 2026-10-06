import {
  executeKeptFunding as executeApplicationKeptFunding,
} from "@/application/money-movement/execute-funding";
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
