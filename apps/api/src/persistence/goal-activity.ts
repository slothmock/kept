export interface GoalLedgerMovement {
  readonly id: string;
  readonly eventId: string;
  readonly eventKind: string;
  readonly shareDeltaAtomic: string;
  readonly createdAt: Date;
}

export function toGoalActivity(rows: readonly GoalLedgerMovement[]) {
  return rows
    .filter((row) => row.eventKind === "TRANSFER" && BigInt(row.shareDeltaAtomic) !== 0n)
    .map((row) => ({
      id: row.id,
      eventId: row.eventId,
      kind: BigInt(row.shareDeltaAtomic) > 0n ? "ADDED" as const : "REMOVED" as const,
      shareDeltaAtomic: row.shareDeltaAtomic,
      createdAt: row.createdAt.toISOString(),
    }));
}
