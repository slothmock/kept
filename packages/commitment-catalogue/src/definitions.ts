import type { CommitmentDefinition } from "./types.js";

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }

  return value;
}

export const COMMITMENT_DEFINITIONS = deepFreeze([
  {
    code: "WEEKLY_SAVINGS_V1",
    version: 1,
    verificationClass: "ONCHAIN",
    parameterSchema: {
      targetAmountAtomic: { kind: "positive-atomic-units" },
      periodDays: { kind: "fixed-integer", value: 7 },
    },
  },
  {
    code: "ACTIVITY_COUNT_V1",
    version: 1,
    verificationClass: "EXTERNAL",
    parameterSchema: {
      targetCount: { kind: "positive-integer" },
      periodDays: { kind: "fixed-integer", value: 7 },
    },
  },
  {
    code: "STUDY_SESSIONS_SOCIAL_V1",
    version: 1,
    verificationClass: "SOCIAL",
    parameterSchema: {
      targetSessions: { kind: "positive-integer" },
      periodDays: { kind: "fixed-integer", value: 7 },
      verifierRequirement: { kind: "verifier-requirement" },
    },
  },
] as const satisfies readonly CommitmentDefinition[]);
