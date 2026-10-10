export {
  evaluateActivityCount,
  evaluateWeeklySavings,
} from "./evaluators.js";

export {
  PersistenceVerificationStore,
} from "./persistence-store.js";

export {
  PersistenceWeeklySavingsEvidenceSource,
} from "./weekly-savings-evidence.js";
export { AllocationWeeklySavingsEvidenceSource } from "./allocation-weekly-savings-evidence.js";
export { RoutedWeeklySavingsEvidenceSource } from "./routed-weekly-savings-evidence.js";

export {
  FixedRewardPolicy,
  ProportionalWeeklySavingsRewardPolicy,
} from "./rewards.js";

export {
  CommitmentVerifier,
} from "./service.js";

export {
  ViemCommitmentSettlementGateway,
} from "./settlement-gateway.js"

export {
  CommitmentVerificationWorker,
} from "./worker.js";

export type {
  ActivityEvidenceSource,
  CommitmentSettlementGateway,
  CommitmentVerificationStore,
  RewardPolicy,
  VerificationDecision,
  VerifiableCommitment,
  WeeklySavingsEvidence,
  WeeklySavingsEvidenceSource,
} from "./types.js";