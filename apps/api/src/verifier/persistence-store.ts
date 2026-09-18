import type { KeptDatabase } from "../db/client.js";
import { KeptRepository, type CommitmentRecord } from "../persistence/repository.js";
import type {
  CommitmentVerificationStore,
  VerifiableCommitment,
} from "./types.js";

function mapCommitment(record: CommitmentRecord): VerifiableCommitment {
  return {
    id: record.id,
    userId: record.userId,
    definitionCode: record.definitionCode,
    definitionVersion: record.definitionVersion,
    parameters: record.parameters,
    epochStart: record.epochStart,
    epochEnd: record.epochEnd,
    verificationDeadline: record.verificationDeadline,
    state: record.state,
    stateVersion: record.stateVersion,
    settlementRef: record.opaqueSettlementRef,
  };
}

export class PersistenceVerificationStore implements CommitmentVerificationStore {
  constructor(private readonly db: KeptDatabase) {}

  async getCommitment(id: string): Promise<VerifiableCommitment | null> {
    const record = await new KeptRepository(this.db).findCommitment(id);
    return record ? mapCommitment(record) : null;
  }

  async finalize(input: {
    readonly commitment: VerifiableCommitment;
    readonly targetState: "COMPLETED" | "FAILED";
    readonly now: Date;
  }): Promise<boolean> {
    return new KeptRepository(this.db).updateCommitmentStateInternal({
      id: input.commitment.id,
      expectedState: "ACTIVE",
      expectedVersion: input.commitment.stateVersion,
      targetState: input.targetState,
      finalizedAt: input.now,
      updatedAt: input.now,
    });
  }
}
