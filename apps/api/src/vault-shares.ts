import {
  getAddress,
  type Address,
} from "viem";

const vaultBalanceAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      {
        name: "account",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "balance",
        type: "uint256",
      },
    ],
  },
  {
    type: "function",
    name: "convertToAssets",
    stateMutability: "view",
    inputs: [
      {
        name: "shares",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "assets",
        type: "uint256",
      },
    ],
  },
] as const;

export interface VaultShareBalanceReader {
  readShares(
    account: string,
    blockNumber?: bigint,
  ): Promise<bigint>;

  convertToAssets(
    shares: bigint,
    blockNumber?: bigint,
  ): Promise<bigint>;
}

interface PublicClient {
  getChainId(): Promise<number>;

  readContract(
    input: unknown,
  ): Promise<bigint>;
}

export function createVaultShareBalanceReader(
  input: {
    readonly publicClient:
      PublicClient;

    readonly vault: Address;

    readonly chainId: number;
  },
): VaultShareBalanceReader {
  async function assertChain(): Promise<void> {
    const actualChainId =
      await input.publicClient
        .getChainId();

    if (
      actualChainId
        !== input.chainId
    ) {
      throw new Error(
        `RPC chain ID does not match configured chain ${input.chainId}`,
      );
    }
  }

  return {
    async readShares(
      account: string,
      blockNumber?: bigint,
    ): Promise<bigint> {
      await assertChain();

      return input.publicClient
        .readContract({
          address: input.vault,
          abi: vaultBalanceAbi,
          functionName:
            "balanceOf",
          args: [
            getAddress(account),
          ],
          ...(blockNumber !== undefined
            ? { blockNumber }
            : {}),
        });
    },

    async convertToAssets(
      shares: bigint,
      blockNumber?: bigint,
    ): Promise<bigint> {
      if (shares < 0n) {
        throw new Error(
          "Vault shares cannot be negative",
        );
      }

      await assertChain();

      return input.publicClient
        .readContract({
          address: input.vault,
          abi: vaultBalanceAbi,
          functionName:
            "convertToAssets",
          args: [shares],
          ...(blockNumber !== undefined
            ? { blockNumber }
            : {}),
        });
    },
  };
}