import {
  previewCryptoWithdrawal as previewApplicationCryptoWithdrawal,
} from "@/application/money-movement/preview-crypto-withdrawal";
import {
  resolveKeptFundingAssets,
} from "@/features/funding/intents/supported-tokens";

type PreviewCryptoWithdrawalInput =
  Omit<
    Parameters<
      typeof previewApplicationCryptoWithdrawal
    >[0],
    "resolveFundingAssets"
  >;

export function previewCryptoWithdrawal(
  input: PreviewCryptoWithdrawalInput,
) {
  return previewApplicationCryptoWithdrawal({
    ...input,
    resolveFundingAssets:
      resolveKeptFundingAssets,
  });
}
