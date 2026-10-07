import { erc20Abi, type Address } from "viem";

import type {
  ContractReader,
  MulticallReader,
} from "@/wallet/blockchain";

const MONAD_MULTICALL3_ADDRESS =
  "0xcA11bde05977b3631167028862bE2a173976CA11" as Address;

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
  readonly publicClient: ContractReader & MulticallReader;
  readonly usdc: Address;
  readonly vault: Address;
  readonly account: Address;
  readonly chainId: number;
}

export async function readVaultPosition({
  publicClient,
  usdc,
  vault,
  account,
  chainId,
}: ReadVaultPositionInput): Promise<VaultPosition> {
  const contracts = [
    {
      address: usdc,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    },
    {
      address: usdc,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account, vault],
    },
    {
      address: vault,
      abi: vaultPositionAbi,
      functionName: "balanceOf",
      args: [account],
    },
    {
      address: vault,
      abi: vaultPositionAbi,
      functionName: "maxWithdraw",
      args: [account],
    },
  ] as const;

  const results =
    chainId === 31_337
      ? await Promise.all(
          contracts.map(
            (contract) =>
              publicClient.readContract(
                contract,
              ),
          ),
        )
      : await publicClient.multicall({
          allowFailure: false,
          multicallAddress:
            MONAD_MULTICALL3_ADDRESS,
          contracts,
        });

  const [
    usdcBalance,
    allowance,
    shares,
    withdrawableAssets,
  ] =
    results;

  if (
    typeof usdcBalance !== "bigint"
    || typeof allowance !== "bigint"
    || typeof shares !== "bigint"
    || typeof withdrawableAssets !== "bigint"
  ) {
    throw new Error(
      "Vault position multicall returned an unexpected result.",
    );
  }

  const assets =
    await publicClient.readContract({
      address: vault,
      abi: vaultPositionAbi,
      functionName: "convertToAssets",
      args: [shares],
    });

  return {
    usdcBalance,
    allowance,
    shares,
    assets,
    withdrawableAssets,
  };
}
