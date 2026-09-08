export class NotFoundError extends Error {
  constructor(resource: string) {
    super(`${resource} was not found`);
    this.name = "NotFoundError";
  }
}

export class PersistenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistenceValidationError";
  }
}

export class IdempotencyConflictError extends Error {
  constructor() {
    super("Idempotency key was already used for a different request");
    this.name = "IdempotencyConflictError";
  }
}

export class IncompleteIdempotencyRecordError extends Error {
  constructor() {
    super("Idempotency record did not contain a completed response");
    this.name = "IncompleteIdempotencyRecordError";
  }
}
