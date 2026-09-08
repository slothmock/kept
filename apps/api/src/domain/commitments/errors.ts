import type { CommitmentState } from "./types.js";

export class StaleCommitmentVersionError extends Error {
  constructor(
    public readonly expectedVersion: number,
    public readonly actualVersion: number,
  ) {
    super(`Stale commitment version: expected ${expectedVersion}, actual ${actualVersion}`);
    this.name = "StaleCommitmentVersionError";
  }
}

export class CommitmentStateMismatchError extends Error {
  constructor(
    public readonly expectedState: CommitmentState,
    public readonly actualState: CommitmentState,
  ) {
    super(`Commitment state mismatch: expected ${expectedState}, actual ${actualState}`);
    this.name = "CommitmentStateMismatchError";
  }
}

export class InvalidCommitmentTransitionError extends Error {
  constructor(
    public readonly currentState: CommitmentState,
    public readonly targetState: CommitmentState,
  ) {
    super(`Invalid commitment transition: ${currentState} -> ${targetState}`);
    this.name = "InvalidCommitmentTransitionError";
  }
}
