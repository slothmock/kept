export type CommitmentCode =
  | "WEEKLY_SAVINGS_V1"
  | "ACTIVITY_COUNT_V1";

interface RewardPolicy {
  readonly weeklyRateBps: number;
  readonly maxRewardAtomic: bigint;
}

export const REWARD_POLICY: Record<
  CommitmentCode,
  RewardPolicy
> = {
  WEEKLY_SAVINGS_V1: {
    weeklyRateBps: 50,
    maxRewardAtomic: 2_000_000n,
  },

  ACTIVITY_COUNT_V1: {
    weeklyRateBps: 25,
    maxRewardAtomic: 1_000_000n,
  },
};

export function rewardRateLabel(
  code: CommitmentCode,
): string {
  const policy = REWARD_POLICY[code];

  return `${(policy.weeklyRateBps / 100).toFixed(2)}%`;
}

const BPS_DENOMINATOR = 10_000n;

export function estimateWeeklyReward(
  averageBalanceAtomic: bigint,
  code: CommitmentCode,
): bigint {
  const policy = REWARD_POLICY[code];

  const calculated =
    (averageBalanceAtomic *
      BigInt(policy.weeklyRateBps)) /
    BPS_DENOMINATOR;

  return calculated > policy.maxRewardAtomic
    ? policy.maxRewardAtomic
    : calculated;
}