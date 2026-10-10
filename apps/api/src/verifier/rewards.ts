import type { RewardPolicy } from "./types.js";

export class FixedRewardPolicy implements RewardPolicy {
  constructor(private readonly rewardAssets: bigint) {
    if (rewardAssets < 0n) {
      throw new Error("rewardAssets must not be negative");
    }
  }

  rewardAssetsFor(): bigint {
    return this.rewardAssets;
  }
}

/**
 * Reward a successfully verified weekly savings commitment by its target,
 * using integer arithmetic in six-decimal USDC atomic units.
 * Qualification (including net saving checks) remains verifier-owned.
 */
export class ProportionalWeeklySavingsRewardPolicy implements RewardPolicy {
  constructor(
    private readonly rewardBps: bigint,
    private readonly maximumRewardAssets: bigint,
  ) {
    if (rewardBps <= 0n || rewardBps > 10_000n) {
      throw new Error("rewardBps must be between 1 and 10000");
    }
    if (maximumRewardAssets <= 0n) {
      throw new Error("maximumRewardAssets must be positive");
    }
  }

  rewardAssetsFor({ commitment }: Parameters<RewardPolicy["rewardAssetsFor"]>[0]): bigint {
    if (commitment.definitionCode !== "WEEKLY_SAVINGS_V1") {
      throw new Error("Proportional rewards only support weekly savings commitments");
    }
    const raw = commitment.parameters.targetAmountAtomic;
    if (typeof raw !== "string" || !/^[1-9]\\d*$/.test(raw)) {
      throw new Error("targetAmountAtomic must be a positive atomic amount");
    }
    const calculated = BigInt(raw) * this.rewardBps / 10_000n;
    if (calculated === 0n) {
      throw new Error("Commitment reward rounds to zero atomic units");
    }
    return calculated < this.maximumRewardAssets ? calculated : this.maximumRewardAssets;
  }
}
