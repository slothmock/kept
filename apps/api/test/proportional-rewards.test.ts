import { describe, expect, it } from "vitest";
import { ProportionalWeeklySavingsRewardPolicy } from "../src/verifier/rewards.js";
import type { VerifiableCommitment } from "../src/verifier/types.js";

const policy = new ProportionalWeeklySavingsRewardPolicy(10n, 10_000_000n);
const sample = (target: string): VerifiableCommitment => ({
  id: "test", userId: "user", definitionCode: "WEEKLY_SAVINGS_V1",
  definitionVersion: 1, parameters: { targetAmountAtomic: target },
  epochStart: new Date("2026-10-01T00:00:00Z"),
  epochEnd: new Date("2026-10-08T00:00:00Z"),
  verificationDeadline: new Date("2026-10-09T00:00:00Z"),
  state: "ACTIVE", stateVersion: 1, settlementRef: new Uint8Array([1]),
  savingsGoalId: "goal",
});
const completed = { outcome: "COMPLETED" as const, evidence: {} };
const amount = (target: string) => policy.rewardAssetsFor({ commitment: sample(target), decision: completed });

describe("ProportionalWeeklySavingsRewardPolicy", () => {
  it("rewards 0.1% of committed USDC in atomic units", () => {
    expect(amount("5000000")).toBe(5_000n);
    expect(amount("1000000000")).toBe(1_000_000n);
    expect(amount("5000000000")).toBe(5_000_000n);
  });
  it("caps a weekly commitment reward at 10 USDC", () => {
    expect(amount("10000000000")).toBe(10_000_000n);
    expect(amount("100000000000")).toBe(10_000_000n);
  });
  it("rejects invalid or zero commitments and reward amounts rounding to zero", () => {
    expect(() => amount("0")).toThrow();
    expect(() => amount("not-a-number")).toThrow();
    expect(() => amount("1")).toThrow();
  });
  it("rejects non-weekly commitments", () => {
    expect(() => policy.rewardAssetsFor({
      commitment: { ...sample("5000000"), definitionCode: "ACTIVITY_COUNT_V1" },
      decision: completed,
    })).toThrow();
  });
  it("requires a valid basis-point rate and positive cap", () => {
    expect(() => new ProportionalWeeklySavingsRewardPolicy(0n, 10_000_000n)).toThrow();
    expect(() => new ProportionalWeeklySavingsRewardPolicy(10n, 0n)).toThrow();
    expect(() => new ProportionalWeeklySavingsRewardPolicy(10_001n, 10_000_000n)).toThrow();
  });
});
