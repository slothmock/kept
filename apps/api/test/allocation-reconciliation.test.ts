import {describe, it, expect} from "vitest";
import {planVaultReconciliation} from "../src/domain/allocation-reconciliation.js";
const A = "GOAL:11111111-1111-4111-8111-111111111111";
const B = "GOAL:22222222-2222-4222-8222-222222222222";
const C = "GOAL:33333333-3333-4333-8333-333333333333";
describe("vault reconciliation plan", () => {
  it("does nothing for matching shares", () => expect(planVaultReconciliation({UNASSIGNED: 20n,[A]:30n},50n)).toBeNull());
  it("credits unexpected shares solely to unassigned", () => expect(planVaultReconciliation({UNASSIGNED:20n,[A]:30n},60n)).toEqual({kind:"RECONCILIATION_CREDIT",legs:[{bucket:"UNASSIGNED",deltaShares:10n}]}));
  it("spends unassigned first", () => expect(planVaultReconciliation({UNASSIGNED:20n,[A]:30n},40n)).toEqual({kind:"RECONCILIATION_DEBIT",legs:[{bucket:"UNASSIGNED",deltaShares:-10n}]}));
  it("reduces goals proportionally only after unassigned is exhausted", () => expect(planVaultReconciliation({UNASSIGNED:20n,[A]:200n,[B]:100n},150n)).toEqual({kind:"RECONCILIATION_DEBIT",legs:[{bucket:"UNASSIGNED",deltaShares:-20n},{bucket:A,deltaShares:-100n},{bucket:B,deltaShares:-50n}]}));
  it("distributes rounding in a deterministic order", () => expect(planVaultReconciliation({[C]:1n,[B]:1n,[A]:1n},2n)).toEqual({kind:"RECONCILIATION_DEBIT",legs:[{bucket:A,deltaShares:-1n}]}));
  it("rejects negative inputs", () => {expect(() => planVaultReconciliation({UNASSIGNED:-1n},0n)).toThrow();expect(() => planVaultReconciliation({},-1n)).toThrow();});
  it("reconciles complete withdrawal to zero", () => expect(planVaultReconciliation({UNASSIGNED:2n,[A]:5n,[B]:3n},0n)?.legs).toEqual([{bucket:"UNASSIGNED",deltaShares:-2n},{bucket:A,deltaShares:-5n},{bucket:B,deltaShares:-3n}]));
});
