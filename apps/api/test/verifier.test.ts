import { describe, expect, it, vi } from "vitest";

import { CommitmentVerifier, FixedRewardPolicy } from "../src/verifier/index.js";
import type {
  ActivityEvidenceSource,
  CommitmentSettlementGateway,
  CommitmentVerificationStore,
  VerifiableCommitment,
  WeeklySavingsEvidenceSource,
} from "../src/verifier/index.js";

function commitment(overrides: Partial<VerifiableCommitment> = {}): VerifiableCommitment {
  return {
    id: "commitment-1",
    userId: "user-1",
    definitionCode: "WEEKLY_SAVINGS_V1",
    definitionVersion: 1,
    parameters: { targetAmountAtomic: "50000000", periodDays: 7 },
    epochStart: new Date("2026-09-01T00:00:00.000Z"),
    epochEnd: new Date("2026-09-08T00:00:00.000Z"),
    verificationDeadline: new Date("2026-09-09T00:00:00.000Z"),
    state: "ACTIVE",
    stateVersion: 2,
    settlementRef: new Uint8Array([1]),
    savingsGoalId: "goal-id-1",
    ...overrides,
  };
}

class MemoryStore implements CommitmentVerificationStore {
  public finalized: { targetState: "COMPLETED" | "FAILED"; now: Date } | null = null;

  constructor(public value: VerifiableCommitment | null) { }

  async getCommitment(): Promise<VerifiableCommitment | null> {
    return this.value;
  }

  async finalize(input: {
    readonly targetState: "COMPLETED" | "FAILED";
    readonly now: Date;
  }): Promise<boolean> {
    this.finalized = { targetState: input.targetState, now: input.now };
    return true;
  }
}

class SettlementSpy implements CommitmentSettlementGateway {
  public completed: bigint | null = null;
  public failed = false;

  async completeCommitment(input: { readonly rewardAssets: bigint }): Promise<void> {
    this.completed = input.rewardAssets;
  }

  async failCommitment(): Promise<void> {
    this.failed = true;
  }
}

function createVerifier(input: {
  commitment: VerifiableCommitment;
  deposited?: bigint;
  activities?: number;
  now?: Date;
}) {
  const store =
    new MemoryStore(input.commitment);

  const settlement =
    new SettlementSpy();

  const weeklySavings:
    WeeklySavingsEvidenceSource = {
    evaluatePeriod: vi.fn(
      async () => ({
        netSavedAtomic:
          input.deposited ?? 0n,

        averageEligibleBalanceAtomic:
          100_000_000n,
      }),
    ),
  };

  const activity:
    ActivityEvidenceSource = {
    async countActivities() {
      return input.activities ?? 0;
    },
  };

  return {
    store,
    settlement,
    verifier:
      new CommitmentVerifier({
        store,
        settlement,
        weeklySavings,
        activity,
        rewards:
          new FixedRewardPolicy(
            5_000_000n,
          ),
        now: () =>
          input.now
          ?? new Date(
            "2026-09-08T12:00:00.000Z",
          ),
      }),
  };
}

describe("CommitmentVerifier", () => {
  it("completes a weekly savings commitment when deposits meet the target", async () => {
    const { verifier, store, settlement } = createVerifier({
      commitment: commitment(),
      deposited: 50_000_000n,
    });

    const result = await verifier.verify("commitment-1");

    expect(result.decision.outcome).toBe("COMPLETED");
    expect(settlement.completed).toBe(5_000_000n);
    expect(store.finalized?.targetState).toBe("COMPLETED");
  });

  it("fails a weekly savings commitment below the target", async () => {
    const { verifier, store, settlement } = createVerifier({
      commitment: commitment(),
      deposited: 49_999_999n,
    });

    const result = await verifier.verify("commitment-1");

    expect(result.decision.outcome).toBe("FAILED");
    expect(settlement.failed).toBe(true);
    expect(store.finalized?.targetState).toBe("FAILED");
  });

  it("completes an activity commitment when the activity count meets the target", async () => {
    const activityCommitment = commitment({
      definitionCode: "ACTIVITY_COUNT_V1",
      parameters: { targetCount: 3, periodDays: 7 },
    });
    const { verifier, settlement } = createVerifier({
      commitment: activityCommitment,
      activities: 3,
    });

    const result = await verifier.verify("commitment-1");

    expect(result.decision.outcome).toBe("COMPLETED");
    expect(settlement.completed).toBe(5_000_000n);
  });

  it("returns RETRY before the commitment period has ended", async () => {
    const { verifier, store, settlement } = createVerifier({
      commitment: commitment(),
      deposited: 50_000_000n,
      now: new Date("2026-09-07T12:00:00.000Z"),
    });

    const result = await verifier.verify("commitment-1");

    expect(result.decision.outcome).toBe("RETRY");
    expect(store.finalized).toBeNull();
    expect(settlement.completed).toBeNull();
    expect(settlement.failed).toBe(false);
  });

  it("settles qualified savings after the deadline instead of punishing an infrastructure delay", async () => {
    const { verifier, settlement, store } = createVerifier({
      commitment: commitment(),
      deposited: 50_000_000n,
      now: new Date("2026-09-10T00:00:00.000Z"),
    });
    const result = await verifier.verify("commitment-1");
    expect(result.decision.outcome).toBe("COMPLETED");
    expect(settlement.completed).toBe(5_000_000n);
    expect(store.finalized?.targetState).toBe("COMPLETED");
  });

  it("still fails unqualified savings after the deadline using original-period evidence", async () => {
    const { verifier, settlement, store } = createVerifier({
      commitment: commitment(),
      deposited: 49_999_999n,
      now: new Date("2026-09-10T00:00:00.000Z"),
    });
    const result = await verifier.verify("commitment-1");
    expect(result.decision.outcome).toBe("FAILED");
    expect(settlement.failed).toBe(true);
    expect(store.finalized?.targetState).toBe("FAILED");
  });

  it("retries insufficient-funding settlement without finalizing or failing qualified savings", async () => {
    const active = commitment();
    const store = new MemoryStore(active);
    let funded = false;
    const completed: bigint[] = [];
    const verifier = new CommitmentVerifier({
      store,
      settlement: {
        async completeCommitment(input) {
          if (!funded) throw new Error("InsufficientTreasuryValue");
          completed.push(input.rewardAssets);
        },
        async failCommitment() { throw new Error("must not fail"); },
      },
      weeklySavings: {
        async evaluatePeriod() {
          return { netSavedAtomic: 50_000_000n, averageEligibleBalanceAtomic: 100_000_000n };
        },
      },
      activity: { async countActivities() { return 0; } },
      rewards: new FixedRewardPolicy(5_000_000n),
      now: () => new Date("2026-09-10T00:00:00.000Z"),
    });
    await expect(verifier.verify(active.id)).rejects.toThrow("InsufficientTreasuryValue");
    expect(store.finalized).toBeNull();
    funded = true;
    expect((await verifier.verify(active.id)).decision.outcome).toBe("COMPLETED");
    expect(completed).toEqual([5_000_000n]);
    expect(store.finalized?.targetState).toBe("COMPLETED");
  });


  it("retries database finalization after a successful onchain settlement", async () => {
    const active = commitment();
    let attempts = 0;
    let writes = 0;
    let completed = false;
    const verifier = new CommitmentVerifier({
      store: {
        async getCommitment() { return active; },
        async finalize() { attempts++; return attempts > 1; },
      },
      weeklySavings: {
        async evaluatePeriod() {
          return { netSavedAtomic: 50_000_000n, averageEligibleBalanceAtomic: 100_000_000n };
        },
      },
      activity: { async countActivities() { return 0; } },
      settlement: {
        async completeCommitment() {
          if (!completed) { writes++; completed = true; }
        },
        async failCommitment() { throw new Error("Unexpected fail"); },
      },
      rewards: new FixedRewardPolicy(5_000_000n),
      now: () => new Date("2026-09-08T12:00:00Z"),
    });
    await expect(verifier.verify(active.id)).rejects.toThrow("Commitment changed");
    expect((await verifier.verify(active.id)).decision.outcome).toBe("COMPLETED");
    expect(attempts).toBe(2);
    expect(writes).toBe(1);
  });
  it("returns RETRY when an evidence source is temporarily unavailable", async () => {
    const store = new MemoryStore(commitment());
    const settlement = new SettlementSpy();
    const onDiagnostic = vi.fn();
    const sourceError = new Error("RPC unavailable at https://private-rpc.example");
    const verifier = new CommitmentVerifier({
      store,
      settlement,
      weeklySavings: {
        async evaluatePeriod() {
          throw sourceError;
        },
      },
      activity: { async countActivities() { return 0; } },
      rewards: new FixedRewardPolicy(5_000_000n),
      now: () => new Date("2026-09-08T12:00:00.000Z"),
      onDiagnostic,
    });

    const result = await verifier.verify("commitment-1");

    expect(result.decision).toEqual({
      outcome: "RETRY",
      reason: "Verification source is temporarily unavailable",
    });
    expect(onDiagnostic).toHaveBeenCalledWith("verification.evidence_source_failed", sourceError);
    expect(store.finalized).toBeNull();
    expect(settlement.failed).toBe(false);
  });

  it("refuses to finalize a commitment that is not linked to onchain settlement", async () => {
    const { verifier } = createVerifier({
      commitment: commitment({ settlementRef: null }),
      deposited: 50_000_000n,
    });

    await expect(verifier.verify("commitment-1")).rejects.toThrow(
      "Commitment has no settlement reference",
    );
  });
});
