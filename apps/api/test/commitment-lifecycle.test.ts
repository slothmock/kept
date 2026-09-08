import { describe, expect, it } from "vitest";

import {
  CommitmentStateMismatchError,
  InvalidCommitmentTransitionError,
  StaleCommitmentVersionError,
  createCommitment,
  transitionCommitment,
  type CommitmentState,
} from "../src/domain/commitments/index.js";

const allowedTransitions = [
  ["DRAFT", "ACTIVE"],
  ["ACTIVE", "AWAITING_PROOF"],
  ["AWAITING_PROOF", "VERIFYING"],
  ["AWAITING_PROOF", "EXPIRED"],
  ["VERIFYING", "QUALIFIED"],
  ["VERIFYING", "NOT_QUALIFIED"],
  ["VERIFYING", "CHALLENGED"],
  ["VERIFYING", "EXPIRED"],
  ["CHALLENGED", "VERIFYING"],
  ["CHALLENGED", "NOT_QUALIFIED"],
  ["CHALLENGED", "EXPIRED"],
  ["QUALIFIED", "SETTLED"],
] as const satisfies readonly (readonly [CommitmentState, CommitmentState])[];

const allStates = [
  "DRAFT",
  "ACTIVE",
  "AWAITING_PROOF",
  "VERIFYING",
  "CHALLENGED",
  "QUALIFIED",
  "NOT_QUALIFIED",
  "EXPIRED",
  "SETTLED",
] as const satisfies readonly CommitmentState[];

function commitmentInState(state: CommitmentState) {
  const paths: Record<CommitmentState, readonly CommitmentState[]> = {
    DRAFT: [],
    ACTIVE: ["ACTIVE"],
    AWAITING_PROOF: ["ACTIVE", "AWAITING_PROOF"],
    VERIFYING: ["ACTIVE", "AWAITING_PROOF", "VERIFYING"],
    CHALLENGED: ["ACTIVE", "AWAITING_PROOF", "VERIFYING", "CHALLENGED"],
    QUALIFIED: ["ACTIVE", "AWAITING_PROOF", "VERIFYING", "QUALIFIED"],
    NOT_QUALIFIED: ["ACTIVE", "AWAITING_PROOF", "VERIFYING", "NOT_QUALIFIED"],
    EXPIRED: ["ACTIVE", "AWAITING_PROOF", "EXPIRED"],
    SETTLED: ["ACTIVE", "AWAITING_PROOF", "VERIFYING", "QUALIFIED", "SETTLED"],
  };
  let commitment = createCommitment({
    id: "commitment-1",
    definition: { code: "WEEKLY_SAVINGS_V1", version: 1 },
    parameters: { targetAmountAtomic: "25000000", periodDays: 7 },
  });

  for (const targetState of paths[state]) {
    commitment = transitionCommitment({
      commitment,
      expectedState: commitment.state,
      expectedVersion: commitment.version,
      targetState,
    });
  }

  return commitment;
}

describe("commitment creation", () => {
  it("creates a frozen draft at version one by default", () => {
    const commitment = createCommitment({
      id: "commitment-1",
      definition: { code: "WEEKLY_SAVINGS_V1", version: 1 },
      parameters: { targetAmountAtomic: "25000000", periodDays: 7 },
    });

    expect(commitment.state).toBe("DRAFT");
    expect(commitment.version).toBe(1);
    expect(Object.isFrozen(commitment)).toBe(true);
    expect(Object.isFrozen(commitment.definition)).toBe(true);
    expect(Object.isFrozen(commitment.parameters)).toBe(true);
  });

  it("protects definition identity and parameters from later caller mutation", () => {
    const definition = { code: "WEEKLY_SAVINGS_V1", version: 1 };
    const parameters = { targetAmountAtomic: "25000000", periodDays: 7 };
    const commitment = createCommitment({ id: "commitment-1", definition, parameters });

    definition.code = "ACTIVITY_COUNT_V1";
    definition.version = 2;
    parameters.targetAmountAtomic = "99999999";

    expect(commitment.definition).toEqual({ code: "WEEKLY_SAVINGS_V1", version: 1 });
    expect(commitment.parameters).toEqual({ targetAmountAtomic: "25000000", periodDays: 7 });
  });

  it("keeps activated definition identity and parameters immutable", () => {
    const draft = commitmentInState("DRAFT");
    const active = transitionCommitment({
      commitment: draft,
      expectedState: "DRAFT",
      expectedVersion: draft.version,
      targetState: "ACTIVE",
    });

    expect(Object.isFrozen(active.definition)).toBe(true);
    expect(Object.isFrozen(active.parameters)).toBe(true);
    expect(active.definition).toEqual(draft.definition);
    expect(active.parameters).toEqual(draft.parameters);
  });
});

describe("commitment transitions", () => {
  it.each(allowedTransitions)("allows %s -> %s and increments the version", (current, target) => {
    const original = commitmentInState(current);
    const transitioned = transitionCommitment({
      commitment: original,
      expectedState: current,
      expectedVersion: original.version,
      targetState: target,
    });

    expect(transitioned.state).toBe(target);
    expect(transitioned.version).toBe(original.version + 1);
    expect(original.state).toBe(current);
    expect(transitioned.definition).toEqual(original.definition);
    expect(transitioned.parameters).toEqual(original.parameters);
    expect(Object.isFrozen(transitioned)).toBe(true);
  });

  it.each(
    allStates.flatMap((current) =>
      allStates
        .filter(
          (target) =>
            !allowedTransitions.some(([allowedCurrent, allowedTarget]) =>
              allowedCurrent === current && allowedTarget === target,
            ),
        )
        .map((target) => [current, target] as const),
    ),
  )("rejects unlisted transition %s -> %s", (current, target) => {
    const commitment = commitmentInState(current);

    expect(() =>
      transitionCommitment({
        commitment,
        expectedState: current,
        expectedVersion: commitment.version,
        targetState: target,
      }),
    ).toThrow(InvalidCommitmentTransitionError);
  });

  it.each(["NOT_QUALIFIED", "EXPIRED", "SETTLED"] as const)(
    "keeps terminal state %s terminal",
    (state) => {
      const commitment = commitmentInState(state);

      expect(() =>
        transitionCommitment({
          commitment,
          expectedState: state,
          expectedVersion: commitment.version,
          targetState: "ACTIVE",
        }),
      ).toThrow(InvalidCommitmentTransitionError);
    },
  );

  it("rejects a stale expected version without changing the commitment", () => {
    const commitment = commitmentInState("DRAFT");

    expect(() =>
      transitionCommitment({
        commitment,
        expectedState: "DRAFT",
        expectedVersion: commitment.version - 1,
        targetState: "ACTIVE",
      }),
    ).toThrow(StaleCommitmentVersionError);
    expect(commitment).toMatchObject({ state: "DRAFT", version: 1 });
  });

  it("rejects an expected version ahead of the current version", () => {
    const commitment = commitmentInState("DRAFT");

    expect(() =>
      transitionCommitment({
        commitment,
        expectedState: "DRAFT",
        expectedVersion: commitment.version + 1,
        targetState: "ACTIVE",
      }),
    ).toThrow(StaleCommitmentVersionError);
    expect(commitment).toMatchObject({ state: "DRAFT", version: 1 });
  });

  it("rejects an unexpected current state without changing the commitment", () => {
    const commitment = commitmentInState("ACTIVE");

    expect(() =>
      transitionCommitment({
        commitment,
        expectedState: "DRAFT",
        expectedVersion: commitment.version,
        targetState: "ACTIVE",
      }),
    ).toThrow(CommitmentStateMismatchError);
    expect(commitment).toMatchObject({ state: "ACTIVE", version: 2 });
  });
});
