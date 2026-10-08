import type { Address } from "viem";

import type { GoalAllocationDto } from "@/api/kept-api";
import type {
  MulticallReader,
} from "@/wallet/blockchain";

const allocationVaultAbi = [
  {
    type: "function",
    name: "convertToAssets",
    stateMutability: "view",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ name: "assets", type: "uint256" }],
  },
  {
    type: "function",
    name: "previewWithdraw",
    stateMutability: "view",
    inputs: [{ name: "assets", type: "uint256" }],
    outputs: [{ name: "shares", type: "uint256" }],
  },
] as const;

interface ContractReader {
  readContract(input: unknown): Promise<bigint>;
}

const MONAD_MULTICALL3_ADDRESS =
  "0xcA11bde05977b3631167028862bE2a173976CA11" as Address;

export interface GoalFundingEntry {
  readonly allocatedShares: bigint;
  readonly allocatedAssets: bigint;
}

export interface GoalFundingSnapshot {
  readonly totalVaultShares: bigint;
  readonly totalAllocatedShares: bigint;
  readonly unallocatedShares: bigint;
  readonly totalAllocatedAssets: bigint;
  readonly unallocatedAssets: bigint;
  readonly byGoal: ReadonlyMap<string, GoalFundingEntry>;
}

export type GoalFundingState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly funding: GoalFundingSnapshot }
  | { readonly kind: "error"; readonly message: string; readonly funding?: GoalFundingSnapshot };

function parseNonnegativeAtomic(value: string, field: string): bigint {
  if (!/^\d+$/.test(value)) throw new Error(`${field} is not a non-negative integer`);
  return BigInt(value);
}

export async function readGoalFunding(input: {
  readonly allocations: readonly GoalAllocationDto[];
  readonly publicClient: ContractReader & MulticallReader;
  readonly vault: Address;
  readonly chainId: number;
}): Promise<GoalFundingSnapshot> {
  if (input.allocations.length === 0) {
    return {
      totalVaultShares: 0n,
      totalAllocatedShares: 0n,
      unallocatedShares: 0n,
      totalAllocatedAssets: 0n,
      unallocatedAssets: 0n,
      byGoal: new Map(),
    };
  }

  const first = input.allocations[0]!;
  const totalVaultShares = parseNonnegativeAtomic(first.totalVaultSharesAtomic, "totalVaultSharesAtomic");
  const totalAllocatedShares = parseNonnegativeAtomic(first.totalAllocatedSharesAtomic, "totalAllocatedSharesAtomic");
  const unallocatedShares = parseNonnegativeAtomic(first.unallocatedSharesAtomic, "unallocatedSharesAtomic");
  if (totalAllocatedShares + unallocatedShares !== totalVaultShares) {
    throw new Error("Goal allocation totals do not match the current savings balance");
  }

  for (const allocation of input.allocations) {
    if (
      allocation.totalVaultSharesAtomic !== first.totalVaultSharesAtomic
      || allocation.totalAllocatedSharesAtomic !== first.totalAllocatedSharesAtomic
      || allocation.unallocatedSharesAtomic !== first.unallocatedSharesAtomic
    ) {
      throw new Error("Goal allocation responses contain inconsistent totals");
    }
  }

  const sharesByGoal =
    input.allocations.map(
      (allocation) => ({
        goalId:
          allocation.goalId,
        shares:
          parseNonnegativeAtomic(
            allocation.allocatedSharesAtomic,
            "allocatedSharesAtomic",
          ),
      }),
    );

  const uniqueShares =
    [...new Set([
      ...sharesByGoal.map(
        ({ shares }) =>
          shares,
      ),
      totalAllocatedShares,
      unallocatedShares,
    ])];

  const convertedValues =
    input.chainId === 31_337
      ? await Promise.all(
          uniqueShares.map(
            (shares) =>
              convertToAssets(
                input.publicClient,
                input.vault,
                shares,
              ),
          ),
        )
      : await input.publicClient.multicall({
          allowFailure: false,
          multicallAddress:
            MONAD_MULTICALL3_ADDRESS,
          contracts:
            uniqueShares.map(
              (shares) => ({
                address:
                  input.vault,
                abi:
                  allocationVaultAbi,
                functionName:
                  "convertToAssets",
                args:
                  [shares],
              }),
            ),
        });

  const conversions =
    new Map<bigint, bigint>();

  uniqueShares.forEach(
    (
      shares,
      index,
    ) => {
      const assets =
        convertedValues[
          index
        ];

      if (
        typeof assets
        !== "bigint"
      ) {
        throw new Error(
          "Goal funding multicall returned an unexpected result.",
        );
      }

      conversions.set(
        shares,
        assets,
      );
    },
  );

  const converted =
    (
      shares: bigint,
    ): bigint => {
      const assets =
        conversions.get(
          shares,
        );

      if (
        assets === undefined
      ) {
        throw new Error(
          "Goal funding conversion is unavailable.",
        );
      }

      return assets;
    };

  const byGoal =
    new Map<
      string,
      GoalFundingEntry
    >();

  sharesByGoal.forEach(
    ({
      goalId,
      shares,
    }) => {
      byGoal.set(
        goalId,
        {
          allocatedShares:
            shares,
          allocatedAssets:
            converted(
              shares,
            ),
        },
      );
    },
  );

  return {
    totalVaultShares,
    totalAllocatedShares,
    unallocatedShares,
    totalAllocatedAssets:
      converted(
        totalAllocatedShares,
      ),
    unallocatedAssets:
      converted(
        unallocatedShares,
      ),
    byGoal,
  };
}

async function convertToAssets(
  publicClient: ContractReader,
  vault: Address,
  shares: bigint,
): Promise<bigint> {
  return publicClient.readContract({
    address: vault,
    abi: allocationVaultAbi,
    functionName: "convertToAssets",
    args: [shares],
  });
}

export function previewAllocationShares(input: {
  readonly assets: bigint;
  readonly publicClient: ContractReader;
  readonly vault: Address;
}): Promise<bigint> {
  return input.publicClient.readContract({
    address: input.vault,
    abi: allocationVaultAbi,
    functionName: "previewWithdraw",
    args: [input.assets],
  });
}

export function deallocationInputError(
  assets: bigint,
  shares: bigint,
  goalAllocatedShares: bigint,
): string | null {
  if (assets <= 0n) {
    return "Enter an amount greater than zero.";
  }

  if (shares > goalAllocatedShares) {
    return "Enter an amount no greater than the savings assigned to this goal.";
  }

  return null;
}

export function goalFundingPercent(
  allocatedAssets: bigint,
  targetAssets: bigint,
): { readonly labelPercent: number; readonly visualPercent: number } {
  if (allocatedAssets <= 0n || targetAssets <= 0n) {
    return { labelPercent: 0, visualPercent: 0 };
  }
  const labelPercentBigInt = allocatedAssets * 100n / targetAssets;
  const labelPercent = Number(labelPercentBigInt > BigInt(Number.MAX_SAFE_INTEGER)
    ? BigInt(Number.MAX_SAFE_INTEGER)
    : labelPercentBigInt);
  return { labelPercent, visualPercent: Math.min(labelPercent, 100) };
}

export function allocationInputError(
  assets: bigint,
  requiredShares: bigint,
  unallocatedShares: bigint,
): string | null {
  if (assets <= 0n) return "Enter an amount greater than zero.";
  if (requiredShares <= 0n) return "That amount is too small to add to this goal.";
  if (requiredShares > unallocatedShares) {
    return "Enter an amount no greater than your unallocated savings.";
  }
  return null;
}
