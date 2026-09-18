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
