import { getAddress, type Address } from "viem";

const vaultBalanceAbi = [{
  type: "function",
  name: "balanceOf",
  stateMutability: "view",
  inputs: [{ name: "account", type: "address" }],
  outputs: [{ name: "balance", type: "uint256" }],
}] as const;

export interface VaultShareBalanceReader {
  readShares(account: string): Promise<bigint>;
}

interface PublicClient {
  getChainId(): Promise<number>;
  readContract(input: unknown): Promise<bigint>;
}

export function createVaultShareBalanceReader(input: {
  readonly publicClient: PublicClient;
  readonly vault: Address;
  readonly chainId: number;
}): VaultShareBalanceReader {
  return {
    async readShares(account: string): Promise<bigint> {
      const actualChainId = await input.publicClient.getChainId();
      if (actualChainId !== input.chainId) {
        throw new Error(`RPC chain ID does not match configured chain ${input.chainId}`);
      }
      return input.publicClient.readContract({
        address: input.vault,
        abi: vaultBalanceAbi,
        functionName: "balanceOf",
        args: [getAddress(account)],
      });
    },
  };
}