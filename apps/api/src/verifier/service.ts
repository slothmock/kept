import { evaluateActivityCount, evaluateWeeklySavings } from "./evaluators.js";
import type {
  ActivityEvidenceSource,
  CommitmentSettlementGateway,
  CommitmentVerificationStore,
  RewardPolicy,
  VerificationDecision,
  VerifiableCommitment,
  WeeklySavingsEvidenceSource,
} from "./types.js";

export interface VerifierDependencies {
  readonly store: CommitmentVerificationStore;
  readonly weeklySavings: WeeklySavingsEvidenceSource;
  readonly activity: ActivityEvidenceSource;
  readonly settlement: CommitmentSettlementGateway;
  readonly rewards: RewardPolicy;
  readonly now?: () => Date;
  readonly onDiagnostic?: (event: string, error: unknown) => void;
}

export interface VerificationResult {
  readonly commitmentId: string;
  readonly decision: VerificationDecision;
}

export class CommitmentVerifier {
  private readonly now: () => Date;

  constructor(private readonly dependencies: VerifierDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async verify(commitmentId: string): Promise<VerificationResult> {
    const commitment = await this.dependencies.store.getCommitment(commitmentId);

    if (!commitment) {
      throw new Error(`Commitment not found: ${commitmentId}`);
    }

    if (commitment.state !== "ACTIVE") {
      throw new Error(`Commitment is not active: ${commitmentId}`);
    }

    if (!commitment.settlementRef) {
      throw new Error(
        `Commitment has no settlement reference: ${commitment.id}`,
      );
    }

    const now = this.now();

    if (now < commitment.epochEnd) {
      return {
        commitmentId,
        decision: {
          outcome: "RETRY",
          reason: "Commitment period has not ended",
        },
      };
    }

    if (now > commitment.verificationDeadline) {
      const decision: VerificationDecision = {
        outcome: "FAILED",
        evidence: {
          reason: "verification-deadline-expired",
        },
      };

      await this.settle(
        commitment,
        decision,
        now
      );

      return {
        commitmentId,
        decision,
      };
    }

    let decision: VerificationDecision;

    try {
      switch (commitment.definitionCode) {
        case "WEEKLY_SAVINGS_V1":
          decision = await evaluateWeeklySavings(
            commitment,
            this.dependencies.weeklySavings
          );
          break;

        case "ACTIVITY_COUNT_V1":
          decision = await evaluateActivityCount(
            commitment,
            this.dependencies.activity
          );
          break;

        default:
          throw new Error(
            `Unsupported commitment definition: ${commitment.definitionCode}`
          );
      }
    } catch (error) {
      this.dependencies.onDiagnostic?.("verification.evidence_source_failed", error);
      return {
        commitmentId,
        decision: {
          outcome: "RETRY",
          reason: "Verification source is temporarily unavailable",
        },
      };
    }

    if (decision.outcome === "RETRY") {
      return {
        commitmentId,
        decision,
      };
    }

    await this.settle(
      commitment,
      decision,
      now
    );

    return {
      commitmentId,
      decision,
    };
  }

  private async settle(
    commitment: VerifiableCommitment,
    decision: Exclude<VerificationDecision, { readonly outcome: "RETRY" }>,
    now: Date,
  ): Promise<void> {
    if (decision.outcome === "COMPLETED") {
      const rewardAssets =
        this.dependencies.rewards.rewardAssetsFor({
          commitment,
          decision,
        });

      if (rewardAssets <= 0n) {
        throw new Error(
          `Completed commitment produced no reward: ${commitment.id}`,
        );
      }

      await this.dependencies.settlement.completeCommitment({
        commitment,
        rewardAssets,
      });
    } else {
      await this.dependencies.settlement.failCommitment({
        commitment,
      });
    }

    const updated = await this.dependencies.store.finalize({
      commitment,
      targetState: decision.outcome,
      now,
    });
    if (!updated) {
      throw new Error(`Commitment changed while being verified: ${commitment.id}`);
    }
  }
}
