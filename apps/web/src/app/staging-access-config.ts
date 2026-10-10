/** Staging account allowlisting applies only to Monad testnet. */
export function requiresStagingAccess(chainId: string | undefined): boolean {
  return chainId === "10143";
}
