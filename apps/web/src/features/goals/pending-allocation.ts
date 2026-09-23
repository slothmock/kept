const STORAGE_KEY_PREFIX = "kept:pending-goal-allocation:v1";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PendingGoalAllocation {
  readonly account: string;
  readonly goalId: string;
  readonly assetsAtomic: string;
  readonly sharesAtomic: string;
  readonly idempotencyKey: string;
}

function storageKey(account: string): string {
  return `${STORAGE_KEY_PREFIX}:${account.toLowerCase()}`;
}

function valid(value: unknown): value is PendingGoalAllocation {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.account === "string"
    && typeof record.goalId === "string"
    && typeof record.idempotencyKey === "string"
    && record.idempotencyKey.length > 0
    && typeof record.assetsAtomic === "string"
    && /^\d+$/.test(record.assetsAtomic)
    && typeof record.sharesAtomic === "string"
    && /^\d+$/.test(record.sharesAtomic);
}

export function loadPendingGoalAllocation(
  storage: StorageLike,
  account: string,
): PendingGoalAllocation | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(storageKey(account)) ?? "null");
    return valid(value) && value.account.toLowerCase() === account.toLowerCase() ? value : null;
  } catch {
    return null;
  }
}

export function savePendingGoalAllocation(
  storage: StorageLike,
  attempt: PendingGoalAllocation,
): boolean {
  try {
    const key = storageKey(attempt.account);
    storage.setItem(key, JSON.stringify(attempt));
    const saved = storage.getItem(key);
    return saved !== null && JSON.stringify(JSON.parse(saved)) === JSON.stringify(attempt);
  } catch {
    return false;
  }
}

export function clearPendingGoalAllocation(storage: StorageLike, account: string): void {
  try {
    storage.removeItem(storageKey(account));
  } catch {
    // Best-effort cleanup only.
  }
}
