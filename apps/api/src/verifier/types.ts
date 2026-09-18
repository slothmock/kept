import type { CommitmentState, JsonValue } from "../domain/commitments/index.js";

export interface VerifiableCommitment {
  readonly id: string;
  readonly userId: string;
  readonly definitionCode: string;
  readonly definitionVersion: number;
  readonly parameters: Readonly<Record<string, JsonValue>>;
  readonly epochStart: Date;
  readonly epochEnd: Date;
  readonly verificationDeadline: Date;
  readonly state: CommitmentState;
  readonly stateVersion: number;
  readonly settlementRef: Uint8Array | null;
}

export type VerificationDecision =
  | {
      readonly outcome: "COMPLETED";
      readonly evidence: Readonly<Record<string, JsonValue>>;
    }
  | {
      readonly outcome: "FAILED";
      readonly evidence: Readonly<Record<string, JsonValue>>;
    }
  | {
      readonly outcome: "RETRY";
      readonly reason: string;
    };

export interface WeeklySavingsEvidenceSource {
  totalDepositedAtomic(input: {
    readonly userId: string;
    readonly startAt: Date;
    readonly endAt: Date;
  }): Promise<bigint>;
}

export interface ActivityEvidenceSource {
  countActivities(input: {
    readonly userId: string;
    readonly startAt: Date;
    readonly endAt: Date;
  }): Promise<number>;
}

export interface CommitmentSettlementGateway {
  completeCommitment(input: {
    readonly commitment: VerifiableCommitment;
    readonly rewardAssets: bigint;
  }): Promise<void>;

  failCommitment(input: {
    readonly commitment: VerifiableCommitment;
  }): Promise<void>;
}

export interface CommitmentVerificationStore {
  getCommitment(id: string): Promise<VerifiableCommitment | null>;

  finalize(input: {
    readonly commitment: VerifiableCommitment;
    readonly targetState: "COMPLETED" | "FAILED";
    readonly now: Date;
  }): Promise<boolean>;
}

export interface RewardPolicy {
  rewardAssetsFor(input: {
    readonly commitment: VerifiableCommitment;
    readonly decision: Extract<VerificationDecision, { readonly outcome: "COMPLETED" }>;
  }): bigint;
}
