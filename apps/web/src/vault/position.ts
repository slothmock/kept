import { erc20Abi, type Address } from "viem";

import type {
  ContractReader,
} from "@/application/ports/blockchain";

const vaultPositionAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    type: "function",
    name: "convertToAssets",
    stateMutability: "view",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ name: "assets", type: "uint256" }],
  },
  {
    type: "function",
    name: "maxWithdraw",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "assets", type: "uint256" }],
  },
] as const;

export interface VaultPosition {
  readonly usdcBalance: bigint;
  readonly allowance: bigint;
  readonly shares: bigint;
  readonly assets: bigint;
  readonly withdrawableAssets: bigint;
}

export interface ReadVaultPositionInput {
  readonly publicClient: ContractReader;
  readonly usdc: Address;
  readonly vault: Address;
  readonly account: Address;
}

export async function readVaultPosition({
  publicClient,
  usdc,
  vault,
  account,
}: ReadVaultPositionInput): Promise<VaultPosition> {
  const [usdcBalance, allowance, shares] = await Promise.all([
    publicClient.readContract({
      address: usdc,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    }),
    publicClient.readContract({
      address: usdc,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account, vault],
    }),
    publicClient.readContract({
      address: vault,
      abi: vaultPositionAbi,
      functionName: "balanceOf",
      args: [account],
    }),
  ]);
  const [assets, withdrawableAssets] = await Promise.all([
    publicClient.readContract({
      address: vault,
      abi: vaultPositionAbi,
      functionName: "convertToAssets",
      args: [shares],
    }),
    publicClient.readContract({
      address: vault,
      abi: vaultPositionAbi,
      functionName: "maxWithdraw",
      args: [account],
    }),
  ]);

  return { usdcBalance, allowance, shares, assets, withdrawableAssets };
}
