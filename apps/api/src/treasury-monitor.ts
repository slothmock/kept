import type { Address, PublicClient } from "viem";

const vaultAbi = [{
  type: "function",
  name: "feeRecipient",
  stateMutability: "view",
  inputs: [],
  outputs: [{ type: "address" }],
}] as const;

const treasuryAbi = [
  {
    type: "function",
    name: "availableRewardAssets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalReservedAssets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "vault",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

export interface TreasuryHealth {
  readonly treasury: Address;
  readonly availableAssets: bigint;
  readonly reservedAssets: bigint;
  readonly belowThreshold: boolean;
}

export async function readTreasuryHealth(input: {
  readonly client: Pick<PublicClient, "readContract">;
  readonly vault: Address;
  readonly lowBalanceThresholdAssets: bigint;
}): Promise<TreasuryHealth> {
  if (input.lowBalanceThresholdAssets < 0n) {
    throw new Error("Treasury monitoring threshold cannot be negative");
  }
  const treasury = await input.client.readContract({
    address: input.vault,
    abi: vaultAbi,
    functionName: "feeRecipient",
  });
  const [linkedVault, availableAssets, reservedAssets] = await Promise.all([
    input.client.readContract({
      address: treasury, abi: treasuryAbi, functionName: "vault",
    }),
    input.client.readContract({
      address: treasury, abi: treasuryAbi, functionName: "availableRewardAssets",
    }),
    input.client.readContract({
      address: treasury, abi: treasuryAbi, functionName: "totalReservedAssets",
    }),
  ]);
  if (linkedVault.toLowerCase() !== input.vault.toLowerCase()) {
    throw new Error("Treasury vault binding does not match configured savings vault");
  }
  return {
    treasury,
    availableAssets,
    reservedAssets,
    belowThreshold: availableAssets < input.lowBalanceThresholdAssets,
  };
}
