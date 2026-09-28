import {
  CommitmentStateMismatchError,
  InvalidCommitmentTransitionError,
  StaleCommitmentVersionError,
} from "./errors.js";
import type {
  Commitment,
  CommitmentDefinitionIdentity,
  CommitmentState,
  JsonValue,
} from "./types.js";

const ALLOWED_TRANSITIONS = {
  DRAFT: [
    "ACTIVE",
    "CANCELLED",
  ],
  ACTIVE: [
    "COMPLETED",
    "FAILED",
    "CANCELLED",
  ],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
  ARCHIVED: [],
} as const satisfies Record<
  CommitmentState,
  readonly CommitmentState[]
>;

function cloneAndFreeze<T>(value: T): Readonly<T> {
  const clone = structuredClone(value);
  return deepFreeze(clone);
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

export function createCommitment(input: {
  readonly id: string;
  readonly definition: CommitmentDefinitionIdentity;
  readonly parameters: Readonly<Record<string, JsonValue>>;
}): Commitment {
  return cloneAndFreeze({
    id: input.id,
    definition: input.definition,
    parameters: input.parameters,
    state: "DRAFT" as const,
    version: 1,
  });
}

export function transitionCommitment(input: {
  readonly commitment: Commitment;
  readonly expectedState: CommitmentState;
  readonly expectedVersion: number;
  readonly targetState: CommitmentState;
}): Commitment {
  const { commitment, expectedState, expectedVersion, targetState } = input;

  if (commitment.version !== expectedVersion) {
    throw new StaleCommitmentVersionError(expectedVersion, commitment.version);
  }
  if (commitment.state !== expectedState) {
    throw new CommitmentStateMismatchError(expectedState, commitment.state);
  }

  const allowedTargets: readonly CommitmentState[] = ALLOWED_TRANSITIONS[commitment.state];
  if (!allowedTargets.includes(targetState)) {
    throw new InvalidCommitmentTransitionError(commitment.state, targetState);
  }

  return cloneAndFreeze({
    ...commitment,
    state: targetState,
    version: commitment.version + 1,
  });
}
