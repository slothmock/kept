import {
  executeCryptoWithdrawal as executeApplicationCryptoWithdrawal,
} from "@/features/withdrawals/core/execute-crypto-withdrawal";
import {
  resolveKeptFundingAssets,
} from "@/features/funding/intents/supported-tokens";

type ExecuteCryptoWithdrawalInput =
  Omit<
    Parameters<
      typeof executeApplicationCryptoWithdrawal
    >[0],
    "resolveFundingAssets"
  >;

export function executeCryptoWithdrawal(
  input: ExecuteCryptoWithdrawalInput,
) {
  return executeApplicationCryptoWithdrawal({
    ...input,
    resolveFundingAssets:
      resolveKeptFundingAssets,
  });
}
