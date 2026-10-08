import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { getAddress, type Address } from "viem";
import type { KeptDatabase } from "../db/client.js";
import { vaultActivityEvents } from "../db/schema.js";

/**
 * Only deposits indexed from confirmed vault logs with an actual share value
 * are candidates. This read does not issue or reclassify ledger credit.
 */
export interface IndexedDepositCandidate {
  readonly chainId: bigint;
  readonly vaultAddress: Address;
  readonly ownerAddress: Address;
  readonly transactionHash: `0x${string}`;
  readonly logIndex: number;
  readonly blockNumber: bigint;
  readonly assets: bigint;
  readonly shares: bigint;
}

export async function listIndexedDepositCandidates(
  db: KeptDatabase,
  input: { readonly chainId: bigint; readonly vaultAddress: string; readonly ownerAddress: string },
): Promise<readonly IndexedDepositCandidate[]> {
  if (input.chainId <= 0n) throw new Error("Invalid deposit chain");
  const vault = getAddress(input.vaultAddress);
  const owner = getAddress(input.ownerAddress);
  const rows = await db.select({
    chainId: vaultActivityEvents.chainId,
    vaultAddress: vaultActivityEvents.vaultAddress,
    ownerAddress: vaultActivityEvents.accountAddress,
    transactionHash: vaultActivityEvents.transactionHash,
    logIndex: vaultActivityEvents.logIndex,
    blockNumber: vaultActivityEvents.blockNumber,
    assets: vaultActivityEvents.assetsAtomic,
    shares: vaultActivityEvents.sharesAtomic,
  }).from(vaultActivityEvents).where(and(
    eq(vaultActivityEvents.chainId, input.chainId),
    sql`lower(${vaultActivityEvents.vaultAddress}) = lower(${vault})`,
    sql`lower(${vaultActivityEvents.accountAddress}) = lower(${owner})`,
    eq(vaultActivityEvents.eventType, "DEPOSIT"),
    isNotNull(vaultActivityEvents.sharesAtomic),
  )).orderBy(asc(vaultActivityEvents.blockNumber),asc(vaultActivityEvents.logIndex));
  return rows.map(row => {
    if (row.shares === null || BigInt(row.shares) <= 0n ||
      !/^0x[0-9a-fA-F]{64}$/.test(row.transactionHash) ||
      !Number.isSafeInteger(row.logIndex) || row.logIndex < 0) {
      throw new Error("Indexed deposit lacks valid minted-share evidence");
    }
    return {
      chainId: row.chainId,
      vaultAddress: getAddress(row.vaultAddress),
      ownerAddress: getAddress(row.ownerAddress),
      transactionHash: row.transactionHash as `0x${string}`,
      logIndex: row.logIndex,
      blockNumber: row.blockNumber,
      assets: BigInt(row.assets),
      shares: BigInt(row.shares),
    };
  });
}
