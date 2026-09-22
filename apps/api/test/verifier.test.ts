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
    ...overrides,
  };
}

class MemoryStore implements CommitmentVerificationStore {
  public finalized: { targetState: "COMPLETED" | "FAILED"; now: Date } | null = null;

  constructor(public value: VerifiableCommitment | null) {}

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
  const store = new MemoryStore(input.commitment);
  const settlement = new SettlementSpy();
  const weeklySavings: WeeklySavingsEvidenceSource = {
    async totalDepositedAtomic() {
      return input.deposited ?? 0n;
    },
  };
  const activity: ActivityEvidenceSource = {
    async countActivities() {
      return input.activities ?? 0;
    },
  };

  return {
    store,
    settlement,
    verifier: new CommitmentVerifier({
      store,
      settlement,
      weeklySavings,
      activity,
      rewards: new FixedRewardPolicy(5_000_000n),
      now: () => input.now ?? new Date("2026-09-08T12:00:00.000Z"),
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

  it("fails after the verification deadline without consulting evidence", async () => {
    let evidenceCalls = 0;
    const store = new MemoryStore(commitment());
    const settlement = new SettlementSpy();
    const verifier = new CommitmentVerifier({
      store,
      settlement,
      weeklySavings: {
        async totalDepositedAtomic() {
          evidenceCalls += 1;
          return 50_000_000n;
        },
      },
      activity: { async countActivities() { return 0; } },
      rewards: new FixedRewardPolicy(5_000_000n),
      now: () => new Date("2026-09-10T00:00:00.000Z"),
    });

    const result = await verifier.verify("commitment-1");

    expect(result.decision.outcome).toBe("FAILED");
    expect(evidenceCalls).toBe(0);
    expect(settlement.failed).toBe(true);
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
        async totalDepositedAtomic() {
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
