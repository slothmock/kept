# KEPT MVP BACKEND / DATA / VERIFICATION SPECIFICATION

**Date:** 08-Sep-2026  
**Status:** Implementation baseline  
**Owner:** Backend / Data / Verification Engineer

> **Governance update (KEPT-PL-023):** Delegated and scheduled automatic saving is removed from the MVP. Any automatic-saving scheduler references below are superseded and must not be implemented.

## 1. Architecture decision

Use a **modular monolith**, not microservices.

One TypeScript backend owns:

- user/profile metadata;
- savings-goal metadata;
- commitment catalogue and lifecycle;
- verification orchestration;
- proof-adapter invocation;
- social-verification collection;
- trust-engine integration;
- Aurora/NEAR Intents persistence;
- RewardController qualification submission;
- Monad event indexing;
- background jobs;
- audit/idempotency infrastructure.

PostgreSQL is the primary application database.

The chain remains authoritative for:

- USDC actually deposited;
- vault shares;
- withdrawals;
- RewardController configuration;
- final reward settlement.

The backend may maintain indexed/projection state for UX and verification, but that state must always be reconstructable from chain events where financial state is concerned.

---

# 2. Database schema

## 2.1 Common conventions

All application IDs use UUIDv7/UUID.

All token amounts are persisted as **integer atomic units**, never floating-point decimals.

For USDC:

`25 USDC = 25000000`

Recommended database representation:

`NUMERIC(78,0)`

All timestamps:

`TIMESTAMPTZ`

All provider/private-key material:

- no wallet private keys;
- no authorization private keys;
- OAuth tokens stored in a secrets system;
- PostgreSQL stores only a secret reference.

State-changing tables should carry:

- `created_at`
- `updated_at`
- where useful, `version INTEGER NOT NULL DEFAULT 1`

for optimistic concurrency/idempotency.

---

# 3. Core enums

```text
verification_class
  ONCHAIN
  EXTERNAL
  SOCIAL

commitment_state
  DRAFT
  ACTIVE
  AWAITING_PROOF
  VERIFYING
  CHALLENGED
  QUALIFIED
  NOT_QUALIFIED
  EXPIRED
  SETTLED

goal_status
  ACTIVE
  COMPLETED
  ARCHIVED

verification_attempt_status
  PENDING
  RUNNING
  SUCCEEDED
  FAILED
  RETRYABLE

verification_request_status
  PENDING
  RESPONDED
  EXPIRED
  CANCELLED

transfer_status
  QUOTED
  PENDING_DEPOSIT
  DEPOSIT_DETECTED
  PROCESSING
  SUCCESS
  INCOMPLETE_DEPOSIT
  REFUNDED
  FAILED

financial_operation_status
  CREATED
  SIGNING
  CHAIN_PENDING
  CONFIRMED
  FAILED
  CANCELLED

reward_submission_status
  NOT_READY
  READY
  SUBMITTING
  CHAIN_PENDING
  CONFIRMED
  FAILED_RETRYABLE
  FAILED_FINAL

automation_status
  PENDING
  ACTIVE
  PAUSED
  REVOKED

automation_attempt_status
  SCHEDULED
  REQUESTING
  POLICY_REJECTED
  CHAIN_PENDING
  CONFIRMED
  FAILED
```

---

# 4. Identity and account tables

## `users`

| Column | Type | Rule |
|---|---|---|
| `id` | UUID PK | internal identity |
| `privy_user_id` | TEXT UNIQUE NOT NULL | Privy identity |
| `display_name` | TEXT NULL | private profile metadata |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

Do not use a wallet address as the application's user identifier.

## `wallets`

| Column | Type |
|---|---|
| `id` | UUID PK |
| `user_id` | UUID FK users |
| `privy_wallet_id` | TEXT NULL |
| `wallet_kind` | TEXT |
| `chain_id` | BIGINT NULL |
| `address` | TEXT NOT NULL |
| `is_primary` | BOOLEAN |
| `created_at` | TIMESTAMPTZ |

MVP primary wallet:

`wallet_kind = PRIVY_EMBEDDED_MONAD`

Unique constraint:

`UNIQUE(chain_id, lower(address))`

Origin wallets connected solely for Intents can also be represented here without storing keys.

---

# 5. Savings goals

## `savings_goals`

| Column | Type |
|---|---|
| `id` | UUID PK |
| `user_id` | UUID FK |
| `name` | TEXT NOT NULL |
| `target_amount_atomic` | NUMERIC(78,0) |
| `target_asset` | TEXT DEFAULT `USDC` |
| `target_date` | DATE NULL |
| `status` | goal_status |
| `created_at` | TIMESTAMPTZ |
| `updated_at` | TIMESTAMPTZ |

The target is private metadata.

The table does **not** contain an authoritative balance.

---

# 6. Financial-operation correlation

The backend needs to know which private goal a verified vault deposit belongs to without pretending to be the financial ledger.

## `goal_financial_operations`

| Column | Type |
|---|---|
| `id` | UUID PK |
| `user_id` | UUID FK |
| `goal_id` | UUID FK |
| `direction` | `DEPOSIT` / `WITHDRAWAL` |
| `source` | `DIRECT_MONAD` / `INTENTS` / `AUTOMATION` |
| `requested_amount_atomic` | NUMERIC(78,0) |
| `intent_transfer_id` | UUID NULL |
| `chain_tx_hash` | TEXT NULL |
| `chain_event_id` | UUID NULL |
| `status` | financial_operation_status |
| `created_at` | TIMESTAMPTZ |
| `confirmed_at` | TIMESTAMPTZ NULL |

A deposit does not count toward a weekly-savings commitment until its corresponding chain event is indexed and reconciled.

This prevents a client request from being mistaken for an actual deposit.

---

# 7. Commitment catalogue

## `commitment_definitions`

| Column | Type |
|---|---|
| `id` | UUID PK |
| `code` | TEXT NOT NULL |
| `version` | INTEGER NOT NULL |
| `category` | TEXT |
| `display_name` | TEXT |
| `verification_class` | verification_class |
| `parameter_schema` | JSONB |
| `verification_config` | JSONB |
| `proof_adapter_key` | TEXT NULL |
| `reward_weight_max` | NUMERIC(6,5) |
| `privacy_policy` | JSONB |
| `active` | BOOLEAN |
| `created_at` | TIMESTAMPTZ |

Constraint:

`UNIQUE(code, version)`

Published definition versions are immutable.

### MVP seed rows

#### `WEEKLY_SAVINGS_V1`

```text
verification_class = ONCHAIN
parameters:
  targetAmountAtomic
  period
proof:
  indexed KeptSavingsVault deposit activity
confidence ceiling:
  1.0
```

#### `ACTIVITY_COUNT_V1`

```text
verification_class = EXTERNAL
parameters:
  targetCount
  period
proof_adapter_key:
  activity-count-v1
normalized result:
  observedEligibleCount
  qualified
confidence:
  bounded by adapter reliability
```

#### `STUDY_SESSIONS_SOCIAL_V1`

```text
verification_class = SOCIAL
parameters:
  targetSessions
  period
  verifierRequirement
recommended verifier count:
  3
minimum YES:
  2
confidence:
  trust engine output
```

No arbitrary reward-bearing definitions are accepted through the public API.

---

# 8. User commitments

## `user_commitments`

| Column | Type |
|---|---|
| `id` | UUID PK |
| `user_id` | UUID FK |
| `savings_goal_id` | UUID FK |
| `definition_id` | UUID FK |
| `parameters` | JSONB |
| `epoch_start` | TIMESTAMPTZ |
| `epoch_end` | TIMESTAMPTZ |
| `verification_deadline` | TIMESTAMPTZ |
| `state` | commitment_state |
| `state_version` | INTEGER DEFAULT 1 |
| `opaque_settlement_ref` | BYTEA UNIQUE |
| `activated_at` | TIMESTAMPTZ NULL |
| `finalized_at` | TIMESTAMPTZ NULL |
| `created_at` | TIMESTAMPTZ |
| `updated_at` | TIMESTAMPTZ |

`opaque_settlement_ref` maps private backend commitment state to RewardController without publishing:

- commitment type;
- verification class;
- behavioural category;
- verifier identity.

**Contract-facing representation of this identifier remains provisional until Contracts returns its first interface.**

---

# 9. Verification orchestration

## `verification_attempts`

Every actual evaluation gets its own attempt.

| Column | Type |
|---|---|
| `id` | UUID PK |
| `commitment_id` | UUID FK |
| `attempt_number` | INTEGER |
| `verification_class` | verification_class |
| `adapter_key` | TEXT NULL |
| `status` | verification_attempt_status |
| `started_at` | TIMESTAMPTZ |
| `completed_at` | TIMESTAMPTZ NULL |
| `failure_code` | TEXT NULL |
| `dedupe_key` | TEXT UNIQUE |

Constraint:

`UNIQUE(commitment_id, attempt_number)`

---

# 10. Normalized proof results

## `normalized_proof_results`

| Column | Type |
|---|---|
| `id` | UUID PK |
| `attempt_id` | UUID UNIQUE FK |
| `schema_version` | INTEGER |
| `qualified` | BOOLEAN |
| `confidence` | NUMERIC(6,5) |
| `normalized_claim` | JSONB |
| `provider` | TEXT NULL |
| `proof_digest` | BYTEA NULL |
| `evaluated_at` | TIMESTAMPTZ |
| `raw_evidence_stored` | BOOLEAN DEFAULT FALSE |

Example external result:

```json
{
  "required": 3,
  "observedEligibleCount": 3,
  "qualified": true,
  "provider": "strava",
  "proofVersion": 1
}
```

Do not persist route, GPS, heart rate, activity photos, detailed titles or other unnecessary raw activity data.

---

# 11. External provider connections

## `external_connections`

| Column | Type |
|---|---|
| `id` | UUID PK |
| `user_id` | UUID FK |
| `provider` | TEXT |
| `provider_subject_hash` | BYTEA NULL |
| `secret_reference` | TEXT |
| `scopes` | TEXT[] |
| `status` | `ACTIVE` / `REVOKED` / `ERROR` |
| `connected_at` | TIMESTAMPTZ |
| `revoked_at` | TIMESTAMPTZ NULL |
| `last_verified_at` | TIMESTAMPTZ NULL |

Constraint:

`UNIQUE(user_id, provider)`

The database does not store provider access tokens directly.

---

# 12. ProofAdapter interface

```ts
interface ProofAdapter {
  key: string;
  version: number;

  evaluate(input: {
    commitmentId: string;
    definitionCode: string;
    parameters: Record<string, unknown>;
    period: {
      startsAt: string;
      endsAt: string;
    };
    connectionRef?: string;
  }): Promise<{
    qualified: boolean;
    confidence: number;
    normalizedClaim: Record<string, unknown>;
    proofDigest?: string;
    provider?: string;
    rawEvidenceStored: false;
  }>;
}
```

Adapters may process transient provider data in memory.

They must not expose their raw provider response to the reward service.

---

# 13. Social graph

## `verification_relationships`

| Column | Type |
|---|---|
| `id` | UUID PK |
| `subject_user_id` | UUID FK |
| `verifier_user_id` | UUID FK |
| `status` | `ACTIVE` / `REVOKED` |
| `created_at` | TIMESTAMPTZ |
| `revoked_at` | TIMESTAMPTZ NULL |

Constraint:

`UNIQUE(subject_user_id, verifier_user_id)`

This table is strictly private/offchain.

---

# 14. Verifier invitations

## `verifier_invitations`

| Column | Type |
|---|---|
| `id` | UUID PK |
| `commitment_id` | UUID FK |
| `subject_user_id` | UUID FK |
| `verifier_user_id` | UUID NULL |
| `delivery_target_hash` | BYTEA NULL |
| `delivery_secret_reference` | TEXT NULL |
| `status` | TEXT |
| `expires_at` | TIMESTAMPTZ |
| `created_at` | TIMESTAMPTZ |

A delivery email/phone address should not become permanent social-graph metadata unnecessarily.

---

# 15. Social verification requests

## `social_verification_requests`

| Column | Type |
|---|---|
| `id` | UUID PK |
| `commitment_id` | UUID FK |
| `verifier_user_id` | UUID FK |
| `prompt_version` | INTEGER |
| `request_token_hash` | BYTEA |
| `status` | verification_request_status |
| `expires_at` | TIMESTAMPTZ |
| `created_at` | TIMESTAMPTZ |
| `responded_at` | TIMESTAMPTZ NULL |

Verifier responses must never reveal:

- saver balance;
- wallet;
- yield;
- savings target;
- other commitments;
- other verifier identities.

---

# 16. Social attestations

## `social_attestations`

| Column | Type |
|---|---|
| `id` | UUID PK |
| `verification_request_id` | UUID UNIQUE FK |
| `commitment_id` | UUID FK |
| `verifier_user_id` | UUID FK |
| `decision` | BOOLEAN |
| `payload_version` | INTEGER |
| `payload_hash` | BYTEA |
| `signature` | BYTEA |
| `signer_address` | TEXT |
| `nonce` | UUID |
| `issued_at` | TIMESTAMPTZ |
| `expires_at` | TIMESTAMPTZ |
| `verified_at` | TIMESTAMPTZ NULL |
| `signature_valid` | BOOLEAN NULL |

These database fields are sufficient to build the storage layer.

However:

**The actual EIP-712 type, domain, typed fields, subject derivation, nonce rules and signature expiry are NOT frozen until Privacy/Security review.**

No contract ABI should depend on this structure.

---

# 17. Trust-engine output

## `trust_evaluations`

| Column | Type |
|---|---|
| `id` | UUID PK |
| `commitment_id` | UUID FK |
| `model_version` | TEXT |
| `confidence` | NUMERIC(6,5) |
| `qualified` | BOOLEAN |
| `challenge_required` | BOOLEAN |
| `reason_codes` | TEXT[] |
| `input_snapshot_hash` | BYTEA |
| `evaluated_at` | TIMESTAMPTZ |

Do not permanently store a large raw social-graph feature dump merely because it is available.

The Security team owns the final trust policy.

Backend owns deterministic execution of the approved policy.

---

# 18. Reward epochs

## `reward_epochs`

This is primarily an indexed/mirrored representation of RewardController state.

| Column | Type |
|---|---|
| `id` | UUID PK |
| `contract_epoch_ref` | TEXT NULL |
| `starts_at` | TIMESTAMPTZ |
| `ends_at` | TIMESTAMPTZ |
| `indexed_budget_atomic` | NUMERIC(78,0) NULL |
| `indexed_eligible_balance_cap_atomic` | NUMERIC(78,0) NULL |
| `rules_hash` | BYTEA NULL |
| `status` | TEXT |
| `last_chain_sync_at` | TIMESTAMPTZ |

The contract is authoritative for financial limits.

---

# 19. Reward qualification

## `reward_qualifications`

| Column | Type |
|---|---|
| `id` | UUID PK |
| `commitment_id` | UUID UNIQUE FK |
| `reward_epoch_id` | UUID FK |
| `opaque_settlement_ref` | BYTEA UNIQUE |
| `qualified` | BOOLEAN |
| `confidence` | NUMERIC(6,5) |
| `verification_result_hash` | BYTEA |
| `submission_status` | reward_submission_status |
| `submission_tx_hash` | TEXT NULL |
| `created_at` | TIMESTAMPTZ |
| `confirmed_at` | TIMESTAMPTZ NULL |

Backend supplies only approved bounded qualification inputs.

It must **not** send arbitrary USDC payout instructions.

---

# 20. Reward settlements

## `reward_settlements`

| Column | Type |
|---|---|
| `id` | UUID PK |
| `qualification_id` | UUID UNIQUE FK |
| `chain_event_id` | UUID UNIQUE FK |
| `reward_amount_atomic` | NUMERIC(78,0) |
| `recipient` | TEXT |
| `settled_at` | TIMESTAMPTZ |

The amount is indexed from RewardController.

It is not authoritative merely because the backend predicted it.

---

# 21. Aurora / NEAR Intents persistence

## `intent_transfers`

| Column | Type |
|---|---|
| `id` | UUID PK |
| `user_id` | UUID FK |
| `goal_id` | UUID FK |
| `provider_quote_id` | TEXT NULL |
| `origin_chain` | TEXT |
| `origin_asset` | TEXT |
| `destination_chain` | TEXT DEFAULT `MONAD` |
| `destination_asset` | TEXT DEFAULT `USDC` |
| `amount_in_atomic` | NUMERIC(78,0) |
| `expected_amount_out_atomic` | NUMERIC(78,0) NULL |
| `actual_amount_out_atomic` | NUMERIC(78,0) NULL |
| `deposit_address` | TEXT |
| `deposit_memo` | TEXT NULL |
| `refund_address` | TEXT |
| `recipient_address` | TEXT |
| `origin_tx_hash` | TEXT NULL |
| `destination_tx_hash` | TEXT NULL |
| `status` | transfer_status |
| `quote_expires_at` | TIMESTAMPTZ NULL |
| `created_at` | TIMESTAMPTZ |
| `updated_at` | TIMESTAMPTZ |

After `SUCCESS`, the USDC belongs in the user's Monad wallet.

A separate `goal_financial_operations` record tracks the subsequent vault deposit.

---

# 22. Automatic savings

## `automation_permissions`

| Column | Type |
|---|---|
| `id` | UUID PK |
| `user_id` | UUID FK |
| `goal_id` | UUID FK |
| `privy_policy_id` | TEXT |
| `delegated_signer_ref` | TEXT |
| `asset_address` | TEXT |
| `vault_address` | TEXT |
| `max_amount_atomic` | NUMERIC(78,0) |
| `cadence_days` | INTEGER DEFAULT 7 |
| `status` | automation_status |
| `next_due_at` | TIMESTAMPTZ |
| `last_confirmed_at` | TIMESTAMPTZ NULL |
| `created_at` | TIMESTAMPTZ |
| `revoked_at` | TIMESTAMPTZ NULL |

The scheduler uses `next_due_at` only to determine when to attempt the action.

It is not the enforcement mechanism.

## `automation_attempts`

| Column | Type |
|---|---|
| `id` | UUID PK |
| `permission_id` | UUID FK |
| `scheduled_for` | TIMESTAMPTZ |
| `amount_atomic` | NUMERIC(78,0) |
| `status` | automation_attempt_status |
| `privy_request_id` | TEXT NULL |
| `chain_tx_hash` | TEXT NULL |
| `failure_code` | TEXT NULL |
| `created_at` | TIMESTAMPTZ |
| `completed_at` | TIMESTAMPTZ NULL |

Constraint:

`UNIQUE(permission_id, scheduled_for)`

A policy rejection is a first-class successful security outcome, not an application crash.

---

# 23. Chain event index

## `chain_events`

| Column | Type |
|---|---|
| `id` | UUID PK |
| `chain_id` | BIGINT |
| `contract_address` | TEXT |
| `contract_role` | TEXT |
| `event_name` | TEXT |
| `block_number` | BIGINT |
| `block_hash` | TEXT |
| `tx_hash` | TEXT |
| `log_index` | INTEGER |
| `event_data` | JSONB |
| `observed_at` | TIMESTAMPTZ |
| `confirmed_at` | TIMESTAMPTZ NULL |

Constraint:

`UNIQUE(chain_id, tx_hash, log_index)`

Indexer processing must be idempotent.

Contract ABIs and exact events remain a Contracts dependency.

---

# 24. Infrastructure tables

## `idempotency_records`

```text
id
user_id
scope
idempotency_key
request_hash
response_status
response_body
expires_at
created_at

UNIQUE(user_id, scope, idempotency_key)
```

All externally initiated POST endpoints involving money, commitments, verification or automation require an `Idempotency-Key`.

## `background_jobs`

```text
id
job_type
dedupe_key UNIQUE
object_type
object_id
payload
run_at
attempt_count
max_attempts
status
last_error_code
created_at
updated_at
```

Required job types include:

- `COMMITMENT_PERIOD_CLOSE`
- `ONCHAIN_COMMITMENT_EVALUATE`
- `EXTERNAL_PROOF_EVALUATE`
- `SOCIAL_TRUST_EVALUATE`
- `VERIFICATION_EXPIRE`
- `REWARD_QUALIFICATION_SUBMIT`
- `INTENTS_STATUS_POLL`
- `CHAIN_EVENT_POLL`
- `AUTOMATION_DUE`
- `DATA_RETENTION_DELETE`

## `audit_events`

Store security/operational events, not raw behavioural evidence.

Examples:

- commitment activated;
- verifier invited;
- attestation accepted/rejected;
- provider disconnected;
- reward qualification submitted;
- automation policy rejected action;
- admin retry executed.

---

# 25. Public API surface

Base:

`/api/v1`

Privy authentication protects saver endpoints.

Verifier requests also require authenticated verifier identity before attestation submission.

## Identity

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/session/sync` | resolve Privy user → Kept user |
| `GET` | `/me` | current user/account metadata |
| `GET` | `/me/wallets` | linked wallet metadata |

---

# 26. Savings goals

| Method | Endpoint |
|---|---|
| `POST` | `/goals` |
| `GET` | `/goals` |
| `GET` | `/goals/:goalId` |
| `PATCH` | `/goals/:goalId` |
| `POST` | `/goals/:goalId/archive` |

`GET /goals/:id` may return an indexed/reconciled financial view, but must label chain state as such and not derive authoritative balances solely from PostgreSQL.

---

# 27. Direct Monad funding

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/goals/:goalId/deposits` | create pending goal deposit operation |
| `POST` | `/financial-operations/:id/transaction` | attach submitted tx hash |
| `GET` | `/financial-operations/:id` | reconciled status |
| `POST` | `/goals/:goalId/withdrawals` | create withdrawal operation |

Transaction construction may ultimately sit partly in Wallet/Intents/front-end code.

The backend owns correlation and reconciliation.

---

# 28. Cross-chain funding

| Method | Endpoint |
|---|---|
| `GET` | `/funding/supported-assets` |
| `POST` | `/funding/intents/quote` |
| `POST` | `/funding/intents/transfers` |
| `POST` | `/funding/intents/transfers/:id/origin-transaction` |
| `GET` | `/funding/intents/transfers/:id` |

On `SUCCESS`, return:

```text
moneyReadyOnMonad = true
nextAction = DEPOSIT_TO_KEPT
```

Do not report the goal as funded until the subsequent KeptSavingsVault transaction confirms.

---

# 29. Commitment catalogue/API

| Method | Endpoint |
|---|---|
| `GET` | `/commitment-definitions` |
| `GET` | `/commitment-definitions/:code` |
| `POST` | `/goals/:goalId/commitments` |
| `GET` | `/commitments/:id` |
| `POST` | `/commitments/:id/activate` |
| `POST` | `/commitments/:id/verification/start` |

`POST /goals/:id/commitments` produces `DRAFT`.

`activate` validates the versioned definition and parameters and freezes that version for the instance.

Clients cannot submit custom verification criteria.

---

# 30. External-provider API

| Method | Endpoint |
|---|---|
| `POST` | `/external-connections/:provider/connect` |
| `GET` | `/external-connections/:provider/callback` |
| `GET` | `/external-connections` |
| `DELETE` | `/external-connections/:provider` |

Actual OAuth URLs/scopes are adapter-specific.

Provider connection is separate from proof evaluation.

---

# 31. Social-verification API

Saver:

| Method | Endpoint |
|---|---|
| `POST` | `/commitments/:id/verifiers` |
| `GET` | `/commitments/:id/verifiers` |
| `DELETE` | `/commitments/:id/verifiers/:relationshipId` |

Verifier:

| Method | Endpoint |
|---|---|
| `GET` | `/verification-requests/:requestId` |
| `POST` | `/verification-requests/:requestId/signing-payload` |
| `POST` | `/verification-requests/:requestId/attestations` |

The `signing-payload` endpoint remains provisional until Security freezes EIP-712 fields.

The response shown to the verifier contains only the approved minimal prompt.

---

# 32. Rewards API

Saver-facing:

| Method | Endpoint |
|---|---|
| `GET` | `/rewards/current` |
| `GET` | `/rewards/history` |
| `GET` | `/commitments/:id/reward-status` |

Internal only:

```text
POST /internal/reward-qualifications/:id/submit
POST /internal/reward-qualifications/:id/retry
```

Do not expose a public endpoint that accepts:

`rewardAmount = arbitrary value`

RewardController decides final bounded financial settlement.

A user claim/settle endpoint is deliberately **not frozen** until the Contracts team provides RewardController's first concrete interface.

---

# 33. Automatic-savings API

| Method | Endpoint |
|---|---|
| `POST` | `/automations` |
| `POST` | `/automations/:id/activate` |
| `POST` | `/automations/:id/pause` |
| `POST` | `/automations/:id/resume` |
| `POST` | `/automations/:id/revoke` |
| `GET` | `/automations` |
| `GET` | `/automations/:id/attempts` |

Wallet/Intents creates the actual Privy policy.

Backend stores its reference and schedules attempts.

---

# 34. Canonical commitment state machine

```text
             ┌─────────┐
             │  DRAFT  │
             └────┬────┘
                  │ activate
                  ▼
             ┌─────────┐
             │ ACTIVE  │
             └────┬────┘
                  │ epoch/proof window opens
                  ▼
        ┌──────────────────┐
        │  AWAITING_PROOF  │
        └────────┬─────────┘
                 │ evaluator/attestation begins
                 ▼
            ┌───────────┐
            │ VERIFYING │
            └─────┬─────┘
                  │
       ┌──────────┼──────────┐
       │          │          │
       ▼          ▼          ▼
 QUALIFIED   NOT_QUALIFIED  CHALLENGED
       │                       │
       │                       ├── stronger/retry proof ──► VERIFYING
       │                       │
       │                       └── deadline ──► EXPIRED
       │
       ▼
 reward qualification
 submitted + chain confirmed
       │
       ▼
    SETTLED
```

Deadline transitions also allow:

```text
AWAITING_PROOF -> EXPIRED
VERIFYING      -> EXPIRED
CHALLENGED     -> EXPIRED
```

`NOT_QUALIFIED` and `EXPIRED` result in zero behavioural entitlement.

A background finalization job may subsequently close their lifecycle without submitting unnecessary negative behavioural information to Monad.

---

# 35. Weekly savings path

```text
DRAFT
→ ACTIVE
→ AWAITING_PROOF
→ VERIFYING
→ chain index queried
→ reconciled goal deposits summed
```

If:

```text
eligibleConfirmedDeposits >= configuredTarget
```

then:

```text
QUALIFIED
confidence = 1.0
```

otherwise:

```text
NOT_QUALIFIED
```

Deposits are counted from indexed, confirmed contract events.

Client requests and unconfirmed transactions never count.

Immediate deposit/withdraw cycles must not create repeated behavioural reward eligibility.

Exact time-weighted balance inputs remain Economics + Contracts dependent.

---

# 36. External activity path

```text
DRAFT
→ ACTIVE
→ AWAITING_PROOF
→ VERIFYING
→ activity-count-v1 ProofAdapter
```

Adapter:

1. resolves approved provider connection;
2. fetches only required data;
3. filters activities in memory;
4. counts eligible sessions;
5. produces normalized proof;
6. discards unnecessary raw response.

Success:

```text
QUALIFIED
```

Failure to meet objective criterion:

```text
NOT_QUALIFIED
```

Temporary provider/API failure:

```text
VERIFYING
→ retry
```

until verification deadline.

Low-quality or ambiguous adapter evidence may produce:

```text
CHALLENGED
```

rather than pretending proof is stronger than it is.

---

# 37. Social study-session path

```text
DRAFT
→ ACTIVE
→ AWAITING_PROOF
```

Backend creates private verification requests.

First valid response:

```text
→ VERIFYING
```

Every attestation is checked for:

- authenticated verifier;
- relationship eligibility;
- commitment/request match;
- nonce validity;
- expiry;
- signature;
- replay;
- duplicate response.

Trust engine then receives approved signals.

Possible outcomes:

### Valid independent attestations

```text
YES count >= required threshold
AND confidence >= qualification threshold
→ QUALIFIED
```

### Weak reciprocal/collusive case

```text
YES count may be sufficient
BUT confidence below threshold
→ CHALLENGED
```

User-facing result:

`Additional verification required`

### Criteria cannot be satisfied

```text
→ NOT_QUALIFIED
```

### Window closes

```text
→ EXPIRED
```

Verifier identities and individual attestations never need to cross the onchain privacy boundary.

---

# 38. State-transition implementation rule

There is exactly one application function allowed to mutate commitment state:

```ts
transitionCommitment({
  commitmentId,
  expectedState,
  expectedVersion,
  targetState,
  reasonCode,
  actor,
})
```

SQL update pattern:

```sql
UPDATE user_commitments
SET
  state = $target,
  state_version = state_version + 1,
  updated_at = now()
WHERE id = $id
  AND state = $expected
  AND state_version = $version;
```

If zero rows change:

- another worker already transitioned it; or
- the requested transition is stale.

The worker reloads state and treats the job idempotently.

Do not let controllers write `state` directly.

---

# 39. Permitted transition matrix

| Current | Allowed next |
|---|---|
| DRAFT | ACTIVE |
| ACTIVE | AWAITING_PROOF |
| AWAITING_PROOF | VERIFYING, EXPIRED |
| VERIFYING | QUALIFIED, NOT_QUALIFIED, CHALLENGED, EXPIRED |
| CHALLENGED | VERIFYING, NOT_QUALIFIED, EXPIRED |
| QUALIFIED | SETTLED |
| NOT_QUALIFIED | terminal/no reward |
| EXPIRED | terminal/no reward |
| SETTLED | terminal |

No transition back to `ACTIVE`.

No mutation of:

- definition version;
- parameters;
- epoch;
- proof rules

after activation.

A changed commitment becomes a new commitment instance.

---

# 40. Background-job behaviour

Workers use PostgreSQL-backed durable jobs for MVP.

No Kafka, workflow engine or separate event platform is justified yet.

Minimum jobs:

### Commitment lifecycle

`COMMITMENT_PERIOD_CLOSE`

Changes:

`ACTIVE -> AWAITING_PROOF`

### Objective verification

`ONCHAIN_COMMITMENT_EVALUATE`

### External proof

`EXTERNAL_PROOF_EVALUATE`

### Social trust

`SOCIAL_TRUST_EVALUATE`

Triggered on valid attestation and again at deadline.

### Verification expiry

`VERIFICATION_EXPIRE`

### Rewards

`REWARD_QUALIFICATION_SUBMIT`

Retries safely until the relevant chain event confirms.

### Intents

`INTENTS_STATUS_POLL`

### Contract indexing

`CHAIN_EVENT_POLL`

### Automatic saving

`AUTOMATION_DUE`

### Privacy

`DATA_RETENTION_DELETE`

---

# 41. Idempotency requirements

Mandatory idempotency applies to:

- goal creation;
- Intents transfer creation;
- financial-operation creation;
- commitment activation;
- verification start;
- verifier invitation;
- attestation submission;
- reward qualification submission;
- automation creation;
- automation execution.

Provider webhook/poll results must also use provider IDs or deterministic dedupe keys.

Chain events are unique by:

```text
(chain_id, tx_hash, log_index)
```

Social attestations are unique by:

```text
verification_request_id
```

and nonce replay must be rejected.

Reward qualification is unique by:

```text
commitment_id
```

plus whatever final opaque replay identifier Contracts specifies.

---

# 42. Contract-facing freeze boundary

Do **not** freeze the following until first Contracts output:

- exact `opaque_settlement_ref` format;
- RewardController epoch identifier representation;
- calldata qualification fields;
- confidence integer/decimal encoding;
- reward-weight encoding;
- claim versus push-settlement flow;
- RewardController event names;
- KeptSavingsVault deposit/withdraw event schemas;
- automation-specific vault function selector;
- precise contract-address configuration model.

Backend code should hide all of these behind:

```text
RewardControllerGateway
VaultEventAdapter
VaultTransactionAdapter
```

instead of spreading ABI assumptions through services.

---

# 43. Security-facing freeze boundary

Do **not** freeze until Privacy/Security review:

- EIP-712 domain;
- EIP-712 primary type;
- `subjectHash` derivation;
- whether commitment type belongs in signed payload;
- verifier-address binding;
- nonce format;
- issued/expiry tolerance;
- replay namespace;
- signature canonicalization;
- payload storage/retention;
- trust-score inputs and thresholds.

Implement:

```text
SignatureVerifier interface
TrustEngine interface
```

now.

Implement their exact cryptographic/policy details after review.

---

# 44. Immediate implementation order

1. PostgreSQL migrations and enums.
2. User/wallet synchronization from Privy.
3. Goal service.
4. Three immutable commitment-definition seeds.
5. Commitment transition service.
6. Chain event indexer skeleton.
7. Goal financial-operation reconciliation.
8. `WEEKLY_SAVINGS_V1` evaluator.
9. Generic ProofAdapter interface.
10. External connection model.
11. `ACTIVITY_COUNT_V1` adapter.
12. Social relationship/request/attestation persistence.
13. SignatureVerifier interface.
14. TrustEngine integration.
15. Reward qualification pipeline behind provisional gateway.
16. Intents transfer persistence/status normalizer.
17. Automation scheduler persistence.
18. Retention/audit/idempotency hardening.
19. Integration fixtures for all three verification routes.

This sequence keeps implementation moving without prematurely freezing Contracts or Security-owned fields.