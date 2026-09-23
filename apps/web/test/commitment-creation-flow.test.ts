import { describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";

import {
  runCommitmentCreation,
  type CommitmentCreationAttempt,
} from "../src/commitments/creation-flow.js";
import type { CommitmentDto } from "../src/api/kept-api.js";
import { CommitmentConfirmationError } from "../src/commitments/commitment-manager.js";

const draft = {
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
} satisfies CommitmentDto;
const transactionHash = `0x${"a".repeat(64)}` as Hex;
const owner = "0x2222222222222222222222222222222222222222" as Address;
const draftInput = {
  goalId: draft.savingsGoalId,
  definition: draft.definition,
  parameters: draft.parameters,
  epochStart: draft.epochStart,
  epochEnd: draft.epochEnd,
  verificationDeadline: draft.verificationDeadline,
};

function dependencies() {
  return {
    draftInput,
    draftIdempotencyKey: "stable-draft-key",
    createDraft: vi.fn().mockResolvedValue(draft),
    sendTransaction: vi.fn().mockResolvedValue(transactionHash),
    confirmTransaction: vi.fn().mockResolvedValue({
      commitmentId: 7n,
      owner,
      referenceId: `0x${"b".repeat(64)}` as Hex,
      transactionHash,
    }),
    activateDraft: vi.fn().mockResolvedValue({
      ...draft,
      state: "ACTIVE",
      stateVersion: 2,
      onchainCommitmentId: "7",
    }),
    now: () => Date.parse("2026-09-23T00:00:00.000Z"),
  };
}

describe("commitment creation recovery", () => {
  it("creates the draft, confirms chain settlement, then activates the API record", async () => {
    const deps = dependencies();
    const onAttempt = vi.fn();
    Object.assign(deps, { onAttempt });
    const result = await runCommitmentCreation(null, deps);

    expect(result.ok).toBe(true);
    expect(deps.createDraft).toHaveBeenCalledWith(draftInput, "stable-draft-key");
    expect(deps.sendTransaction).toHaveBeenCalledWith(draft);
    expect(deps.confirmTransaction).toHaveBeenCalledWith(draft, transactionHash);
    expect(deps.activateDraft).toHaveBeenCalledWith(draft, expect.objectContaining({ commitmentId: 7n }));
    expect(onAttempt).toHaveBeenCalledTimes(4);
    expect(onAttempt).toHaveBeenLastCalledWith(expect.objectContaining({
      transactionHash,
      settlement: expect.objectContaining({ commitmentId: 7n }),
    }));
  });

  it("retries API activation without creating another draft or chain transaction", async () => {
    const deps = dependencies();
    deps.activateDraft.mockRejectedValueOnce(new Error("API unavailable"));
    const first = await runCommitmentCreation(null, deps);
    expect(first).toMatchObject({ ok: false });
    const attempt = (first as { attempt: CommitmentCreationAttempt }).attempt;

    deps.createDraft.mockClear();
    deps.sendTransaction.mockClear();
    deps.confirmTransaction.mockClear();
    const second = await runCommitmentCreation(attempt, deps);

    expect(second.ok).toBe(true);
    expect(deps.createDraft).not.toHaveBeenCalled();
    expect(deps.sendTransaction).not.toHaveBeenCalled();
    expect(deps.confirmTransaction).not.toHaveBeenCalled();
    expect(deps.activateDraft).toHaveBeenCalledTimes(2);
  });

  it("reuses the submitted transaction hash when receipt confirmation must be retried", async () => {
    const deps = dependencies();
    deps.confirmTransaction.mockRejectedValueOnce(new Error("RPC unavailable"));
    const first = await runCommitmentCreation(null, deps);
    const attempt = (first as { attempt: CommitmentCreationAttempt }).attempt;

    deps.createDraft.mockClear();
    deps.sendTransaction.mockClear();
    const second = await runCommitmentCreation(attempt, deps);

    expect(second.ok).toBe(true);
    expect(deps.createDraft).not.toHaveBeenCalled();
    expect(deps.sendTransaction).not.toHaveBeenCalled();
    expect(deps.confirmTransaction).toHaveBeenLastCalledWith(draft, transactionHash);
  });

  it("does not report success when API state points at a different chain commitment", async () => {
    const deps = dependencies();
    deps.activateDraft.mockResolvedValueOnce({
      ...draft,
      state: "ACTIVE",
      stateVersion: 2,
      onchainCommitmentId: "8",
    });

    const result = await runCommitmentCreation(null, deps);

    expect(result).toMatchObject({
      ok: false,
      attempt: { settlement: { commitmentId: 7n } },
    });
  });

  it("retains the draft idempotency key before an ambiguous create response", async () => {
    const deps = {
      ...dependencies(),
      createDraft: vi.fn().mockRejectedValueOnce(new Error("response lost")),
      draftInput,
      draftIdempotencyKey: "stable-draft-key",
    };

    const result = await runCommitmentCreation(null, deps);

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.attempt).toMatchObject({
      draftIdempotencyKey: "stable-draft-key",
    });
  });

  it("drops a reverted hash so retry can submit a replacement transaction", async () => {
    const deps = dependencies();
    deps.confirmTransaction.mockRejectedValueOnce(
      new CommitmentConfirmationError("reverted", true),
    );
    const first = await runCommitmentCreation(null, deps);
    expect(first.ok ? null : first.attempt?.transactionHash).toBeUndefined();

    await runCommitmentCreation(first.ok ? null : first.attempt, deps);
    expect(deps.sendTransaction).toHaveBeenCalledTimes(2);
  });

  it("marks irreconcilable confirmed transactions as blocked", async () => {
    const deps = dependencies();
    deps.confirmTransaction.mockRejectedValueOnce(
      new CommitmentConfirmationError("event mismatch", false),
    );
    const first = await runCommitmentCreation(null, deps);
    expect(first.ok ? null : first.attempt?.terminalFailure).toBe("event mismatch");

    deps.confirmTransaction.mockClear();
    const second = await runCommitmentCreation(first.ok ? null : first.attempt, deps);
    expect(second.ok).toBe(false);
    expect(deps.confirmTransaction).not.toHaveBeenCalled();
  });

  it("does not call the API when durable recovery state cannot be saved", async () => {
    const deps = dependencies();
    Object.assign(deps, {
      onAttempt: () => { throw new Error("storage unavailable"); },
    });

    const result = await runCommitmentCreation(null, deps);

    expect(result.ok).toBe(false);
    expect(deps.createDraft).not.toHaveBeenCalled();
  });

  it("blocks replacement submission after the draft start time has passed", async () => {
    const deps = dependencies();
    Object.assign(deps, { now: () => Date.parse(draft.epochStart) });

    const result = await runCommitmentCreation(null, deps);

    expect(result).toMatchObject({
      ok: false,
      attempt: { terminalFailure: "The commitment setup window has expired." },
    });
    expect(deps.sendTransaction).not.toHaveBeenCalled();
  });
});
