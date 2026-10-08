import { describe, expect, it } from "vitest";
import {
  assertLedgerEvent,
  assertNonnegativeBalances,
  goalBucket,
} from "../src/domain/allocation-ledger.js";

const goalA = goalBucket("11111111-1111-4111-8111-111111111111");
const goalB = goalBucket("22222222-2222-4222-8222-222222222222");

describe("allocation ledger foundation", () => {
  it("accepts an atomic balanced unassigned-to-goal transfer", () => {
    expect(() => assertLedgerEvent("TRANSFER", [
      { bucket: "UNASSIGNED", deltaShares: -25n },
      { bucket: goalA, deltaShares: 25n },
    ])).not.toThrow();
  });

  it("does not accept minting shares through a transfer", () => {
    expect(() => assertLedgerEvent("TRANSFER", [
      { bucket: "UNASSIGNED", deltaShares: -25n },
      { bucket: goalA, deltaShares: 30n },
    ])).toThrow();
  });

  it("rejects single-sided allocations and self transfers", () => {
    expect(() => assertLedgerEvent("TRANSFER", [
      { bucket: goalA, deltaShares: 25n },
    ])).toThrow();
    expect(() => assertLedgerEvent("TRANSFER", [
      { bucket: goalA, deltaShares: -25n },
      { bucket: goalA, deltaShares: 25n },
    ])).toThrow();
  });

  it("prevents negative bucket balances", () => {
    expect(() => assertNonnegativeBalances(new Map([["UNASSIGNED", 24n]]), [
      { bucket: "UNASSIGNED", deltaShares: -25n },
      { bucket: goalA, deltaShares: 25n },
    ])).toThrow();
  });

  it("does not classify goal-to-goal transfers as vault credits", () => {
    expect(() => assertLedgerEvent("TRANSFER", [
      { bucket: goalA, deltaShares: -25n },
      { bucket: goalB, deltaShares: 25n },
    ])).not.toThrow();
    expect(() => assertLedgerEvent("VAULT_CREDIT", [
      { bucket: goalA, deltaShares: 25n },
    ])).toThrow();
  });

  it("rejects fabricated opening negative positions", () => {
    expect(() => assertLedgerEvent("OPENING", [
      { bucket: "UNASSIGNED", deltaShares: -1n },
    ])).toThrow();
  });
});
