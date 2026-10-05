import type { ChainIdReader } from "@/application/ports/blockchain";

export type NetworkReadiness =
  | { readonly ready: true }
  | { readonly ready: false; readonly message: string; readonly diagnostic: unknown };

export function parseEvmChainId(value: string | undefined): number | null {
  const match = /^eip155:(\d+)$/.exec(value ?? "");
  if (!match?.[1]) return null;

  const chainId = Number(match[1]);
  return Number.isSafeInteger(chainId) && chainId > 0 ? chainId : null;
}

export function parseProviderChainId(value: unknown): number | null {
  if (typeof value !== "string" || !/^0x[\da-f]+$/i.test(value)) return null;

  const chainId = Number.parseInt(value.slice(2), 16);
  return Number.isSafeInteger(chainId) && chainId > 0 ? chainId : null;
}

export async function checkNetworkReadiness(input: {
  readonly expectedChainId: number;
  readonly walletChainId: number | null;
  readonly rpc: ChainIdReader;
}): Promise<NetworkReadiness> {
  let rpcChainId: number;
  try {
    rpcChainId = await input.rpc.getChainId();
  } catch (error) {
    return {
      ready: false,
      message: "Kept's network connection is unavailable. Try again later.",
      diagnostic: error,
    };
  }

  if (rpcChainId !== input.expectedChainId) {
    return {
      ready: false,
      message: "Kept's network connection is unavailable. Try again later.",
      diagnostic: new Error(`RPC chain mismatch: expected ${input.expectedChainId}, received ${rpcChainId}.`),
    };
  }

  if (input.walletChainId !== input.expectedChainId) {
    return {
      ready: false,
      message: "Your account is connected to a different network. Switch networks before adding or withdrawing money.",
      diagnostic: new Error(`Wallet chain mismatch: expected ${input.expectedChainId}, received ${input.walletChainId ?? "unknown"}.`),
    };
  }

  return { ready: true };
}
