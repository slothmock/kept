export const COMMITMENT_CODES = [
  "WEEKLY_SAVINGS_V1",
  "ACTIVITY_COUNT_V1",
] as const;

export type CommitmentCode = (typeof COMMITMENT_CODES)[number];
export type VerificationClass = "ONCHAIN" | "EXTERNAL";

export interface ParameterRule {
  readonly kind: "positive-atomic-units" | "positive-integer" | "fixed-integer";
  readonly value?: number;
}

export interface CommitmentDefinition {
  readonly code: CommitmentCode;
  readonly version: 1;
  readonly verificationClass: VerificationClass;
  readonly parameterSchema: Readonly<Record<string, ParameterRule>>;
}

export interface WeeklySavingsParameters {
  readonly targetAmountAtomic: string;
  readonly periodDays: 7;
}

export interface ActivityCountParameters {
  readonly targetCount: number;
  readonly periodDays: 7;
}

export type CommitmentParameters =
  | WeeklySavingsParameters
  | ActivityCountParameters;

export type ValidationResult =
  | { readonly valid: true; readonly value: CommitmentParameters }
  | { readonly valid: false; readonly issues: readonly string[] };
