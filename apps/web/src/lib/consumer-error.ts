export type ConsumerErrorCode =
  | "authentication_required"
  | "connection_failed"
  | "contract_reverted"
  | "not_found"
  | "request_cancelled"
  | "request_conflict"
  | "request_in_progress"
  | "rate_limited"
  | "service_unavailable"
  | "synchronizing"
  | "validation_failed"
  | "wallet_unavailable"
  | "wrong_network";

interface ConsumerErrorOptions {
  readonly code?: ConsumerErrorCode;
  readonly cause?: unknown;
  readonly diagnosticCode?: string;
  readonly progressPercent?: number | null;
}

export class ConsumerError extends Error {
  readonly code: ConsumerErrorCode | undefined;
  readonly diagnosticCause: unknown;
  readonly diagnosticCode: string | undefined;
  readonly progressPercent: number | null | undefined;

  constructor(message: string, options: ConsumerErrorOptions = {}) {
    super(message);
    this.name = "ConsumerError";
    this.code = options.code;
    this.diagnosticCause = options.cause;
    this.diagnosticCode = options.diagnosticCode;
    this.progressPercent = options.progressPercent;
  }
}

function property(value: unknown, key: "code" | "name"): unknown {
  return value !== null && typeof value === "object" && key in value
    ? value[key as keyof typeof value]
    : undefined;
}

function isWalletRejection(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 4 && current !== null && typeof current === "object"; depth += 1) {
    const code = property(current, "code");
    const name = property(current, "name");
    if (
      code === 4001
      || code === "4001"
      || code === "ACTION_REJECTED"
      || name === "UserRejectedRequestError"
      || name === "TransactionRejectedRpcError"
    ) {
      return true;
    }
    current = "cause" in current ? current.cause : null;
  }
  return false;
}

function isContractRevert(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5 && current !== null && typeof current === "object"; depth += 1) {
    if (property(current, "name") === "ContractFunctionRevertedError") return true;
    current = "cause" in current ? current.cause : null;
  }
  return false;
}

export function consumerErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConsumerError) return error.message;
  if (isWalletRejection(error)) return "You cancelled the request. No money was moved.";
  if (isContractRevert(error)) return "The transaction was not completed. Your money was not moved.";
  return fallback;
}
