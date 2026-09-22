export class ConsumerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConsumerError";
  }
}

export function consumerErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ConsumerError ? error.message : fallback;
}
