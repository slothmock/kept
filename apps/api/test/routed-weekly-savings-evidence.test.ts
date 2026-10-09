import { describe, expect, it, vi } from "vitest";
import { RoutedWeeklySavingsEvidenceSource } from "../src/verifier/routed-weekly-savings-evidence.js";
const period = {
  userId:"user-1",goalId:"goal-1",
  startAt:new Date("2026-10-01T00:00:00Z"),
  endAt:new Date("2026-10-08T00:00:00Z"),
};
function fixture(initialized:boolean,ready=true) {
  const legacy={evaluatePeriod:vi.fn(async()=>({
    netSavedAtomic:1n,averageEligibleBalanceAtomic:2n,
  }))};
  const ledger={evaluatePeriod:vi.fn(async()=>({
    netSavedAtomic:10n,averageEligibleBalanceAtomic:20n,
  }))};
  const assertLedgerEvidenceReady=vi.fn(async()=>{
    if(!ready)throw new Error("Deposit attribution pending");
  });
  const source=new RoutedWeeklySavingsEvidenceSource({
    legacy,ledger,
    isLedgerInitialized:async()=>initialized,
    assertLedgerEvidenceReady,
  });
  return {source,legacy,ledger,assertLedgerEvidenceReady};
}
describe("weekly savings evidence routing",()=>{
  it("uses ledger provenance for initialized accounts",async()=>{
    const f=fixture(true);
    expect(await f.source.evaluatePeriod(period)).toEqual({
      netSavedAtomic:10n,averageEligibleBalanceAtomic:20n,
    });
    expect(f.ledger.evaluatePeriod).toHaveBeenCalledOnce();
    expect(f.legacy.evaluatePeriod).not.toHaveBeenCalled();
    expect(f.assertLedgerEvidenceReady).toHaveBeenCalledWith(period.userId);
  });
  it("preserves legacy evidence only for non-initialized accounts",async()=>{
    const f=fixture(false);
    expect((await f.source.evaluatePeriod(period)).netSavedAtomic).toBe(1n);
    expect(f.ledger.evaluatePeriod).not.toHaveBeenCalled();
    expect(f.assertLedgerEvidenceReady).not.toHaveBeenCalled();
  });
  it("fails closed when an initialized account has unverified indexing",async()=>{
    const f=fixture(true,false);
    await expect(f.source.evaluatePeriod(period)).rejects.toThrow(/attribution pending/);
    expect(f.legacy.evaluatePeriod).not.toHaveBeenCalled();
    expect(f.ledger.evaluatePeriod).not.toHaveBeenCalled();
  });
});
