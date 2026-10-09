/**
 * Indexing runs on Monad testnet and mainnet, never on local Anvil.
 * Mainnet must declare an explicit, sufficiently early historical start;
 * using the testnet fallback would silently omit potentially eligible logs.
 */
export function resolveVaultActivityIndexStartAt(
  chainId: 143 | 10143 | 31337,
  environment: NodeJS.ProcessEnv,
): Date | undefined {
  if (chainId === 31337) return undefined;
  const key = chainId === 143
    ? "VAULT_ACTIVITY_INDEX_MAINNET_START_AT"
    : "VAULT_ACTIVITY_INDEX_START_AT";
  const raw = environment[key]?.trim() ||
    (chainId === 10143 ? "2026-10-02T00:00:00.000Z" : undefined);
  if (!raw) {
    throw new Error(
      "VAULT_ACTIVITY_INDEX_MAINNET_START_AT is required for Monad mainnet deposit attribution",
    );
  }
  // Canonical UTC is unambiguous across deployments and safe for block lookup.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/.test(raw)) {
    throw new Error(`${key} must be a UTC ISO timestamp with whole seconds`);
  }
  const timestamp = new Date(raw);
  if (!Number.isFinite(timestamp.getTime()) ||
      timestamp.toISOString() !== raw) {
    throw new Error(`${key} must be a valid UTC timestamp`);
  }
  return timestamp;
}
