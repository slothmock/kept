import type {
    FundingAsset,
} from "@/features/funding/intents/supported-tokens";

export type CryptoWithdrawalRoute =
    | "direct"
    | "intents";

export function cryptoWithdrawalRoute(
    destinationAsset:
        FundingAsset,
): CryptoWithdrawalRoute {
    if (
        destinationAsset.blockchain ===
        "monad" &&
        destinationAsset.symbol ===
        "USDC"
    ) {
        return "direct";
    }

    return "intents";
}