import type { FundingAsset } from "@/features/funding/intents/supported-tokens";

export interface CryptoWithdrawalInput {
    readonly amount: bigint;
    readonly recipient: string;
    readonly destination: FundingAsset;
}

export interface CryptoWithdrawalPreview {
    readonly amount: bigint;
    readonly estimatedOutput: bigint;
    readonly minimumOutput: bigint;
    readonly destination: FundingAsset;
    readonly recipient: string;
    readonly route: "direct" | "aurora";
}