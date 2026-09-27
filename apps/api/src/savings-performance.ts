import type { VaultSavingsActivityReader } from "./vault-activity.js";

import type { VaultShareBalanceReader } from "./vault-shares.js";

export interface SavingsPerformanceDto {
  readonly depositedAssetsAtomic: string;
  readonly withdrawnAssetsAtomic: string;
  readonly netContributionsAtomic: string;
  readonly currentAssetsAtomic: string;
  readonly earningsAssetsAtomic: string;
}

export interface SavingsPerformanceReader {
  readPerformance(input: {
    readonly account: string;
    readonly startAt: Date;
    readonly endAt: Date;
  }): Promise<SavingsPerformanceDto>;
}

export function createSavingsPerformanceReader(dependencies: {
  readonly vaultActivity: VaultSavingsActivityReader;

  readonly vaultShares: VaultShareBalanceReader;
}): SavingsPerformanceReader {
  return {
    async readPerformance(input) {
      const [shares, activity] = await Promise.all([
        dependencies.vaultShares.readShares(input.account),

        dependencies.vaultActivity.readActivity({
          account: input.account,
          startAt: input.startAt,
          endAt: input.endAt,
        }),
      ]);

      const currentAssets =
        await dependencies.vaultShares.convertToAssets(shares);

      const earningsAssets =
        currentAssets + activity.withdrawnAssets - activity.depositedAssets;

      return {
        depositedAssetsAtomic: activity.depositedAssets.toString(),

        withdrawnAssetsAtomic: activity.withdrawnAssets.toString(),

        netContributionsAtomic: activity.netAssets.toString(),

        currentAssetsAtomic: currentAssets.toString(),

        earningsAssetsAtomic: earningsAssets.toString(),
      };
    },
  };
}
