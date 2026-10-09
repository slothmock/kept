import { describe, expect, it } from "vitest";
import { assertAllocationCutoverParity } from "../src/domain/allocation-cutover.js";

const goalA = "11111111-1111-4111-8111-111111111111";
const goalB = "22222222-2222-4222-8222-222222222222";
const valid = {
  hasOpening: true,
  liveVaultShares: 100n,
  legacyGoalShares: {[goalA]: 40n, [goalB]: 10n},
  ledgerBalances: {UNASSIGNED: 50n, [`GOAL:${goalA}`]: 40n, [`GOAL:${goalB}`]: 10n},
};

describe("allocation cutover parity", () => {
  it("accepts identical legacy, ledger and live vault positions", () => {
    expect(() => assertAllocationCutoverParity(valid)).not.toThrow();
  });
  it("requires an explicit opening event", () => {
    expect(() => assertAllocationCutoverParity({...valid,hasOpening:false})).toThrow(/opening/);
  });
  it("rejects stale vault balance", () => {
    expect(() => assertAllocationCutoverParity({...valid,liveVaultShares:101n})).toThrow();
  });
  it("rejects per-goal mismatches even when aggregate shares match", () => {
    expect(() => assertAllocationCutoverParity({...valid,ledgerBalances:{UNASSIGNED:50n,[`GOAL:${goalA}`]:30n,[`GOAL:${goalB}`]:20n}})).toThrow(/mismatch/);
  });
  it("rejects negative and unexpected buckets", () => {
    expect(() => assertAllocationCutoverParity({...valid,ledgerBalances:{...valid.ledgerBalances,OTHER:1n}})).toThrow(/Unexpected/);
    expect(() => assertAllocationCutoverParity({...valid,legacyGoalShares:{[goalA]:-1n}})).toThrow(/Negative/);
  });
  it("accepts a fully unassigned account with an opening event", () => {
    expect(() => assertAllocationCutoverParity({hasOpening:true, liveVaultShares:7n, legacyGoalShares:{}, ledgerBalances:{UNASSIGNED:7n}})).not.toThrow();
  });
});
