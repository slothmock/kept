export interface CommitmentSchedule {
  readonly startAt: Date;
  readonly endAt: Date;
  readonly verificationDeadline: Date;
}

export function commitmentSchedule(now = new Date()): CommitmentSchedule {
  const startAt = new Date(Math.ceil((now.getTime() + 5 * 60 * 1000) / 1000) * 1000);
  const endAt = new Date(startAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    startAt,
    endAt,
    verificationDeadline: new Date(endAt.getTime() + 24 * 60 * 60 * 1000),
  };
}
