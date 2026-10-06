import {
  previewKeptFunding as previewApplicationKeptFunding,
} from "@/features/funding/intents/core/preview-funding";
import {
  resolveKeptFundingAssets,
} from "@/features/funding/intents/supported-tokens";

type PreviewKeptFundingInput =
  Omit<
    Parameters<
      typeof previewApplicationKeptFunding
    >[0],
    "resolveFundingAssets"
  >;

export function previewKeptFunding(
  input: PreviewKeptFundingInput,
) {
  return previewApplicationKeptFunding({
    ...input,
    resolveFundingAssets:
      resolveKeptFundingAssets,
  });
}
