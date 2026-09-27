export interface CommitmentSchedule {
  readonly startAt: Date;
  readonly endAt: Date;
  readonly verificationDeadline: Date;
}

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const DAY_MS = 24 * 60 * MINUTE_MS;

const PRODUCTION_START_DELAY_MS =
  5 * MINUTE_MS;

const PRODUCTION_WINDOW_MS =
  7 * DAY_MS;

const PRODUCTION_VERIFICATION_WINDOW_MS =
  1 * DAY_MS;

const LOCAL_START_DELAY_MS =
  10 * SECOND_MS;

const LOCAL_VERIFICATION_WINDOW_MS =
  5 * MINUTE_MS;

function localCommitmentWindowMs(): number | null {
  if (
    import.meta.env.VITE_ENABLE_LOCAL_ANVIL
    !== "true"
  ) {
    return null;
  }

  const raw =
    import.meta.env
      .VITE_DEV_COMMITMENT_WINDOW_SECONDS;

  if (!raw) {
    return null;
  }

  const seconds =
    Number(raw);

  if (
    !Number.isSafeInteger(seconds)
    || seconds < 10
  ) {
    return null;
  }

  return seconds * SECOND_MS;
}

export function commitmentSchedule(
  now = new Date(),
): CommitmentSchedule {
  const localWindowMs = localCommitmentWindowMs();

  const startDelayMs = localWindowMs === null
    ? PRODUCTION_START_DELAY_MS
    : LOCAL_START_DELAY_MS;

  const windowMs = localWindowMs ?? PRODUCTION_WINDOW_MS;

  const verificationWindowMs =
    localWindowMs === null
      ? PRODUCTION_VERIFICATION_WINDOW_MS
      : LOCAL_VERIFICATION_WINDOW_MS;

  const startAt = new Date(
    Math.ceil(
      (now.getTime()
        + startDelayMs
      ) / SECOND_MS,
    ) * SECOND_MS,
  );

  const endAt = new Date(
    startAt.getTime()
    + windowMs,
  );

  return {
    startAt,
    endAt,
    verificationDeadline:
      new Date(
        endAt.getTime()
        + verificationWindowMs,
      ),
  };
}