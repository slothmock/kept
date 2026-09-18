import { getAddress, isAddress, type Address } from "viem";

export interface VaultConfig {
  readonly rpcUrl: string;
  readonly chainId: number;
  readonly vault: Address;
  readonly usdc: Address;
}

type PublicEnvironment = Readonly<Record<string, string | undefined>>;

function isHttpUrl(value: string | undefined): value is string {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function readPositiveChainId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }

  const chainId = Number(value);
  return Number.isSafeInteger(chainId) && chainId > 0 ? chainId : null;
}

export function readVaultConfig(environment: PublicEnvironment): VaultConfig | null {
  const rpcUrl = environment.VITE_MONAD_RPC_URL;
  const chainId = readPositiveChainId(environment.VITE_MONAD_CHAIN_ID);
  const vault = environment.VITE_KEPT_VAULT_ADDRESS;
  const usdc = environment.VITE_MONAD_USDC_ADDRESS;

  if (!isHttpUrl(rpcUrl) || !chainId || !vault || !usdc || !isAddress(vault) || !isAddress(usdc)) {
    return null;
  }

  return {
    rpcUrl,
    chainId,
    vault: getAddress(vault),
    usdc: getAddress(usdc),
  };
}
