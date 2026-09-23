import { describe, expect, it } from "vitest";
import { getAddress, type Hex } from "viem";

import type { CommitmentCreationAttempt } from "../src/commitments/creation-flow.js";
import {
  clearPendingCommitmentAttempt,
  loadPendingCommitmentAttempt,
  pendingAttemptIsResolved,
  savePendingCommitmentAttempt,
} from "../src/commitments/pending-attempt.js";

const account = getAddress("0x2222222222222222222222222222222222222222");
const transactionHash = `0x${"a".repeat(64)}` as Hex;
const attempt: CommitmentCreationAttempt = {
  draftInput: {
    goalId: "goal-1",
    definition: { code: "WEEKLY_SAVINGS_V1", version: 1 },
    parameters: { targetAmountAtomic: "10000000", periodDays: 7 },
    epochStart: "2026-09-23T00:05:00.000Z",
    epochEnd: "2026-09-30T00:05:00.000Z",
    verificationDeadline: "2026-10-01T00:05:00.000Z",
  },
  draftIdempotencyKey: "stable-draft-key",
  draft: {
    id: "00000000-0000-4000-8000-000000000001",
    userId: "user-1",
    savingsGoalId: "goal-1",
    definition: { code: "WEEKLY_SAVINGS_V1", version: 1 },
    parameters: { targetAmountAtomic: "10000000", periodDays: 7 },
    epochStart: "2026-09-23T00:05:00.000Z",
    epochEnd: "2026-09-30T00:05:00.000Z",
    verificationDeadline: "2026-10-01T00:05:00.000Z",
    state: "DRAFT",
    stateVersion: 1,
    onchainCommitmentId: null,
    activatedAt: null,
    finalizedAt: null,
    createdAt: "2026-09-22T23:00:00.000Z",
    updatedAt: "2026-09-22T23:00:00.000Z",
  },
  transactionHash,
  settlement: {
    commitmentId: 7n,
    referenceId: `0x${"b".repeat(64)}`,
    owner: account,
    transactionHash,
  },
};

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    values,
  };
}

describe("pending commitment attempt storage", () => {
  it("round-trips confirmed chain state without losing bigint commitment ids", () => {
    const storage = memoryStorage();
    expect(savePendingCommitmentAttempt(storage, account, attempt)).toBe(true);
    expect(loadPendingCommitmentAttempt(storage, account)).toEqual(attempt);
  });

  it("is account-scoped and rejects malformed storage", () => {
    const storage = memoryStorage();
    savePendingCommitmentAttempt(storage, account, attempt);
    expect(loadPendingCommitmentAttempt(
      storage,
      getAddress("0x3333333333333333333333333333333333333333"),
    )).toBeNull();
    const storageKey = storage.values.keys().next().value;
    if (typeof storageKey !== "string") throw new Error("expected stored retry key");
    storage.values.set(storageKey, "{bad json");
    expect(loadPendingCommitmentAttempt(storage, account)).toBeNull();
  });

  it("clears a completed attempt", () => {
    const storage = memoryStorage();
    savePendingCommitmentAttempt(storage, account, attempt);
    clearPendingCommitmentAttempt(storage, account);
    expect(loadPendingCommitmentAttempt(storage, account)).toBeNull();
  });

  it("treats an activated API record or a missing draft as resolved", () => {
    expect(pendingAttemptIsResolved(attempt, [{
      ...attempt.draft,
      state: "ACTIVE",
      stateVersion: 2,
      onchainCommitmentId: "7",
    }])).toBe(true);
    expect(pendingAttemptIsResolved(attempt, [])).toBe(true);
  });

  it("retains a matching API draft for retry", () => {
    expect(pendingAttemptIsResolved(attempt, [attempt.draft])).toBe(false);
  });
});
