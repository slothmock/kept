export const COMMITMENT_STATES = [
  "DRAFT",
  "ACTIVE",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "ARCHIVED",
] as const;

export type CommitmentState = (typeof COMMITMENT_STATES)[number];

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface CommitmentDefinitionIdentity {
  readonly code: string;
  readonly version: number;
}

export interface Commitment {
  readonly id: string;
  readonly definition: CommitmentDefinitionIdentity;
  readonly parameters: Readonly<Record<string, JsonValue>>;
  readonly state: CommitmentState;
  readonly version: number;
}
