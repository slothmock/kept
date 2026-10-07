import {
  encodeFunctionData,
  erc20Abi,
  type Address,
  type Hex,
} from "viem";

const keptSavingsVaultAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
] as const;

export interface UnsignedVaultTransaction {
  readonly to: Address;
  readonly data: Hex;
  readonly chainId: number;
}

export interface VaultDepositInput {
  readonly usdc: Address;
  readonly vault: Address;
  readonly receiver: Address;
  readonly assets: bigint;
  readonly chainId: number;
}

export interface VaultWithdrawInput {
  readonly vault: Address;
  readonly receiver: Address;
  readonly owner: Address;
  readonly assets: bigint;
  readonly chainId: number;
}

export function buildVaultDepositTransactions({
  usdc,
  vault,
  receiver,
  assets,
  chainId,
}: VaultDepositInput): readonly [UnsignedVaultTransaction, UnsignedVaultTransaction] {
  return [
    {
      to: usdc,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [vault, assets],
      }),
      chainId,
    },
    {
      to: vault,
      data: encodeFunctionData({
        abi: keptSavingsVaultAbi,
        functionName: "deposit",
        args: [assets, receiver],
      }),
      chainId,
    },
  ];
}

export function buildVaultWithdrawTransaction({
  vault,
  receiver,
  owner,
  assets,
  chainId,
}: VaultWithdrawInput): UnsignedVaultTransaction {
  return {
    to: vault,
    data: encodeFunctionData({
      abi: keptSavingsVaultAbi,
      functionName: "withdraw",
      args: [assets, receiver, owner],
    }),
    chainId,
  };
}
