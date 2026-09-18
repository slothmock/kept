# Verifier changes

The API now contains an internal commitment-verification layer under `src/verifier/`.

## Supported MVP commitments

- `WEEKLY_SAVINGS_V1`: compares the user's verified Kept deposit activity during the commitment window against `targetAmountAtomic`.
- `ACTIVITY_COUNT_V1`: compares qualifying external activities during the commitment window against `targetCount`.

## Design

The verifier is not exposed as a public user HTTP route. It is composed from:

- `CommitmentVerifier`: orchestration and lifecycle rules.
- `WeeklySavingsEvidenceSource`: adapter boundary for Kept/onchain deposit evidence.
- `ActivityEvidenceSource`: adapter boundary for Strava or another activity provider.
- `CommitmentSettlementGateway`: adapter boundary for the Solidity `CommitmentManager` verifier wallet.
- `RewardPolicy`: decides the reward sent to `completeCommitment` (a fixed policy is included for the MVP).
- `PersistenceVerificationStore`: persists `ACTIVE -> COMPLETED/FAILED` only after onchain settlement succeeds.

A commitment must have an `opaqueSettlementRef` before it can be finalized. This prevents the API database from saying a commitment is complete when the corresponding onchain commitment has not been created/linked yet.

## Remaining integrations

The verifier core is intentionally independent of provider SDKs. The next adapters are:

1. Monad/Kept vault deposit-event reader for `WeeklySavingsEvidenceSource`.
2. Strava adapter for `ActivityEvidenceSource`.
3. Monad `CommitmentManager` writer for `CommitmentSettlementGateway`.
4. Activation flow that creates the onchain commitment and stores its opaque settlement reference.
