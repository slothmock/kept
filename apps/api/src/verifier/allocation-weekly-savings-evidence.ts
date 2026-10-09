import type { KeptDatabase } from "../db/client.js";
import type { VaultShareBalanceReader } from "../vault-shares.js";
import type { VaultSavingsActivityReader } from "../vault-activity.js";
import type { WeeklySavingsEvidence, WeeklySavingsEvidenceSource } from "./types.js";
import { readQualifiedGoalShares } from "../persistence/allocation-provenance-reader.js";
import { calculateAverageGoalShares, readGoalLedgerBalanceHistory } from "../persistence/allocation-goal-balance-history.js";

/**
 * Read-only replacement for legacy weekly savings evidence.
 * Not activated until the ledger and on-chain history have been audited.
 */
export class AllocationWeeklySavingsEvidenceSource implements WeeklySavingsEvidenceSource {
  constructor(private readonly dependencies:{
    db:KeptDatabase;
    repository:{
      findPrimaryWalletForOwnerOnChain(userId:string,chainId:bigint):
        Promise<{readonly address:string}|null>;
    };
    vaultShares:VaultShareBalanceReader;
    vaultActivity:VaultSavingsActivityReader;
    chainId:bigint;
  }) {}

  async evaluatePeriod(input:{
    readonly userId:string;readonly goalId:string;
    readonly startAt:Date;readonly endAt:Date;
  }):Promise<WeeklySavingsEvidence> {
    if (!Number.isFinite(input.startAt.getTime()) ||
        !Number.isFinite(input.endAt.getTime()) || input.endAt<=input.startAt) {
      throw new Error("Invalid weekly savings verification period");
    }
    const wallet=await this.dependencies.repository.findPrimaryWalletForOwnerOnChain(
      input.userId,this.dependencies.chainId,
    );
    if(!wallet)throw new Error("User has no primary wallet for the configured chain");
    // Historical ledger balances, provenance movements and goal withdrawals
    // must observe the same committed snapshot. READ COMMITTED (the default)
    // permits a concurrent transfer between these queries, producing evidence
    // that never existed at one point in time.
    const [ledgerEvidence,activity]=await Promise.all([
      this.dependencies.db.transaction(async tx => {
        const history=await readGoalLedgerBalanceHistory(tx,input);
        const qualifiedShares=await readQualifiedGoalShares(tx,input);
        return {history,qualifiedShares};
      },{isolationLevel:"repeatable read"}),
      this.dependencies.vaultActivity.readActivity({
        account:wallet.address,startAt:input.startAt,endAt:input.endAt,
      }),
    ]);
    const {history,qualifiedShares}=ledgerEvidence;
    const averageShares=calculateAverageGoalShares({
      startAt:input.startAt,endAt:input.endAt,
      openingShares:history.openingShares,deltas:history.deltas,
    });
    const [qualifiedAssets,averageAssets]=await Promise.all([
      this.dependencies.vaultShares.convertToAssets(qualifiedShares),
      this.dependencies.vaultShares.convertToAssets(averageShares),
    ]);
    if(qualifiedAssets<0n||averageAssets<0n)throw new Error("Negative converted savings assets");
    const netAssets=activity.netAssets>0n?activity.netAssets:0n;
    return {
      netSavedAtomic:qualifiedAssets<netAssets?qualifiedAssets:netAssets,
      averageEligibleBalanceAtomic:averageAssets,
    };
  }
}
