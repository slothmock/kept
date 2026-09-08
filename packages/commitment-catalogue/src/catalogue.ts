import { COMMITMENT_DEFINITIONS } from "./definitions.js";
import type {
  CommitmentCode,
  CommitmentParameters,
  ValidationResult,
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isPositiveAtomicUnits(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d*$/.test(value);
}

function validWeeklySavings(value: Record<string, unknown>): boolean {
  return (
    hasExactKeys(value, ["targetAmountAtomic", "periodDays"]) &&
    isPositiveAtomicUnits(value.targetAmountAtomic) &&
    value.periodDays === 7
  );
}

function validActivityCount(value: Record<string, unknown>): boolean {
  return (
    hasExactKeys(value, ["targetCount", "periodDays"]) &&
    isPositiveInteger(value.targetCount) &&
    value.periodDays === 7
  );
}

function validVerifierRequirement(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["recommendedVerifierCount", "minimumYesCount"]) &&
    value.recommendedVerifierCount === 3 &&
    value.minimumYesCount === 2
  );
}

function validStudySessions(value: Record<string, unknown>): boolean {
  return (
    hasExactKeys(value, ["targetSessions", "periodDays", "verifierRequirement"]) &&
    isPositiveInteger(value.targetSessions) &&
    value.periodDays === 7 &&
    validVerifierRequirement(value.verifierRequirement)
  );
}

export function getCommitmentDefinition(code: string) {
  return COMMITMENT_DEFINITIONS.find((definition) => definition.code === code);
}

export function validateCommitmentParameters(code: string, parameters: unknown): ValidationResult {
  if (!getCommitmentDefinition(code)) {
    return { valid: false, issues: [`Unknown commitment definition: ${code}`] };
  }

  if (!isRecord(parameters)) {
    return { valid: false, issues: ["Parameters must be an object"] };
  }

  const valid =
    (code === "WEEKLY_SAVINGS_V1" && validWeeklySavings(parameters)) ||
    (code === "ACTIVITY_COUNT_V1" && validActivityCount(parameters)) ||
    (code === "STUDY_SESSIONS_SOCIAL_V1" && validStudySessions(parameters));

  if (!valid) {
    return { valid: false, issues: [`Invalid parameters for ${code}`] };
  }

  return { valid: true, value: parameters as unknown as CommitmentParameters };
}

export function isCommitmentCode(code: string): code is CommitmentCode {
  return getCommitmentDefinition(code) !== undefined;
}
