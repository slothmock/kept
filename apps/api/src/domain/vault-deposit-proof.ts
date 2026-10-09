/**
 * A verified vault Deposit log is the only acceptable origin for fresh shares.
 * An observed balance increase, asset-only index record or user-provided tx hash
 * is not sufficient evidence of newly minted ERC-4626 vault shares.
 */
export interface VaultDepositProof {
  readonly chainId: bigint;
  readonly vaultAddress: string;
  readonly ownerAddress: string;
  readonly transactionHash: string;
  readonly logIndex: number;
  readonly shares: bigint;
  readonly assets: bigint;
  readonly finalized: boolean;
}

export interface ExpectedVaultDeposit {
  readonly chainId: bigint;
  readonly vaultAddress: string;
  readonly ownerAddress: string;
  readonly transactionHash: string;
  readonly logIndex: number;
  readonly shares: bigint;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;

function normalizedAddress(value: string): string {
  if (!ADDRESS.test(value)) throw new Error("Invalid deposit address");
  return value.toLowerCase();
}

function normalizedHash(value: string): string {
  if (!HASH.test(value)) throw new Error("Invalid deposit transaction hash");
  return value.toLowerCase();
}

/** Called only with log data returned from a trusted chain reader. */
export function validateVaultDepositProof(
  proof: VaultDepositProof,
  expected: ExpectedVaultDeposit,
): string {
  if (!proof.finalized) throw new Error("Deposit receipt is not finalized");
  if (proof.chainId <= 0n || expected.chainId <= 0n || proof.chainId !== expected.chainId) {
    throw new Error("Deposit chain mismatch");
  }
  if (normalizedAddress(proof.vaultAddress) !== normalizedAddress(expected.vaultAddress)) {
    throw new Error("Deposit vault mismatch");
  }
  if (normalizedAddress(proof.ownerAddress) !== normalizedAddress(expected.ownerAddress)) {
    throw new Error("Deposit owner mismatch");
  }
  if (normalizedHash(proof.transactionHash) !== normalizedHash(expected.transactionHash)) {
    throw new Error("Deposit transaction mismatch");
  }
  if (!Number.isSafeInteger(proof.logIndex) || proof.logIndex < 0 ||
      !Number.isSafeInteger(expected.logIndex) || expected.logIndex < 0 ||
      proof.logIndex !== expected.logIndex) {
    throw new Error("Deposit log index mismatch");
  }
  if (proof.shares <= 0n || expected.shares <= 0n || proof.shares !== expected.shares ||
      proof.assets < 0n) {
    throw new Error("Deposit shares mismatch");
  }
  return [
    proof.chainId.toString(),
    normalizedAddress(proof.vaultAddress),
    normalizedHash(proof.transactionHash),
    proof.logIndex.toString(),
  ].join(":");
}
