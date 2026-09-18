import { describe, expect, it } from "vitest";

import {
  COMMITMENT_DEFINITIONS,
  getCommitmentDefinition,
  validateCommitmentParameters,
} from "../src/index.js";

const expectedCodes = [
  "WEEKLY_SAVINGS_V1",
  "ACTIVITY_COUNT_V1",
] as const;

describe("MVP commitment catalogue", () => {
  it("contains exactly the accepted financial and health activity definitions", () => {
    expect(COMMITMENT_DEFINITIONS.map(({ code }) => code)).toEqual(expectedCodes);
  });

  it("contains exactly the onchain and external verification classes", () => {
    expect(COMMITMENT_DEFINITIONS.map(({ verificationClass }) => verificationClass).sort()).toEqual([
      "EXTERNAL",
      "ONCHAIN",
    ]);
  });

  it("uses unique immutable code and version identities", () => {
    const identities = COMMITMENT_DEFINITIONS.map(({ code, version }) => `${code}:${version}`);

    expect(new Set(identities).size).toBe(COMMITMENT_DEFINITIONS.length);
    expect(COMMITMENT_DEFINITIONS.every((definition) => definition.version === 1)).toBe(true);
    expect(Object.isFrozen(COMMITMENT_DEFINITIONS)).toBe(true);
    expect(COMMITMENT_DEFINITIONS.every(Object.isFrozen)).toBe(true);
    expect(COMMITMENT_DEFINITIONS.every(({ parameterSchema }) => Object.isFrozen(parameterSchema))).toBe(true);
  });

  it("does not return a definition for unsupported commitment codes", () => {
    expect(getCommitmentDefinition("STUDY_SESSIONS_SOCIAL_V1")).toBeUndefined();
    expect(getCommitmentDefinition("CUSTOM_REWARD_V1")).toBeUndefined();
  });
});

describe("commitment parameter validation", () => {
  it.each([
    ["WEEKLY_SAVINGS_V1", { targetAmountAtomic: "25000000", periodDays: 7 }],
    ["ACTIVITY_COUNT_V1", { targetCount: 3, periodDays: 7 }],
  ] as const)("accepts valid parameters for %s", (code, parameters) => {
    expect(validateCommitmentParameters(code, parameters)).toEqual({ valid: true, value: parameters });
  });

  it.each([
    ["WEEKLY_SAVINGS_V1", { targetAmountAtomic: "0", periodDays: 7 }],
    ["WEEKLY_SAVINGS_V1", { targetAmountAtomic: "25.0", periodDays: 7 }],
    ["WEEKLY_SAVINGS_V1", { targetAmountAtomic: "25000000", periodDays: 14 }],
    ["ACTIVITY_COUNT_V1", { targetCount: 0, periodDays: 7 }],
    ["ACTIVITY_COUNT_V1", { targetCount: 1.5, periodDays: 7 }],
    ["ACTIVITY_COUNT_V1", { targetCount: Number.MAX_SAFE_INTEGER + 1, periodDays: 7 }],
    ["ACTIVITY_COUNT_V1", { targetCount: 3, periodDays: 14 }],
    ["ACTIVITY_COUNT_V1", { targetCount: 3, periodDays: 7, customRewardWeight: 10 }],
    ["ACTIVITY_COUNT_V1", null],
  ] as const)("rejects invalid parameters for %s", (code, parameters) => {
    const result = validateCommitmentParameters(code, parameters);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });

  it("rejects parameters for removed or unknown definitions", () => {
    expect(validateCommitmentParameters("STUDY_SESSIONS_SOCIAL_V1", {})).toEqual({
      valid: false,
      issues: ["Unknown commitment definition: STUDY_SESSIONS_SOCIAL_V1"],
    });

    expect(validateCommitmentParameters("CUSTOM_REWARD_V1", {})).toEqual({
      valid: false,
      issues: ["Unknown commitment definition: CUSTOM_REWARD_V1"],
    });
  });
});
