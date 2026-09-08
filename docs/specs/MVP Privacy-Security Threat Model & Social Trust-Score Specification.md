# KEPT — MVP PRIVACY / SECURITY THREAT MODEL & SOCIAL TRUST-SCORE SPECIFICATION

**Date:** 08-Sep-2026  
**Owner:** Privacy, Trust & Security Lead  
**Status:** MVP implementation specification  
**Scope:** Current hackathon MVP only

## 1. Security objective

Kept is allowed to make verified behaviour financially consequential.

It is not allowed to require surveillance to accomplish that.

The MVP therefore needs to preserve four properties:

1. A user's raw behavioural evidence and social graph remain private/offchain by default.
2. A verifier can influence reward qualification but cannot access funds or become an unquestioned oracle.
3. Compromise of Kept infrastructure does not create unrestricted authority over user savings.
4. Abuse of the behavioural reward system is bounded enough that farming is unattractive relative to the obtainable reward.

The MVP trust mechanism is intentionally narrow.

It demonstrates:

**independent verification → sufficient confidence → qualification**

and:

**weak reciprocal verification → insufficient confidence → additional verification required**

It does **not** claim generalized Sybil resistance.

---

# 2. MVP PRIVACY BOUNDARY

## Private / restricted data

| Data | Classification | Required location |
|---|---|---|
| Raw external activity/provider response | Restricted behavioural data | Transient backend memory/provider |
| GPS/routes/location | Restricted behavioural data | Must not be collected for MVP unless indispensable |
| Health metrics | Restricted behavioural data | Must not be collected |
| OAuth/access tokens | Restricted credential | Encrypted secret storage |
| Verifier identity | Confidential social data | Backend only |
| Subject ↔ verifier relationship | Confidential social-graph data | Backend only |
| Signed social attestation | Confidential verification data | Backend only |
| Goal name/context | Confidential user data | Backend only |
| Commitment parameters | Confidential unless objectively financial | Backend by default |
| Privy authorization key | Critical secret | Server secret infrastructure |
| Delegated-signer configuration | Security-sensitive | Backend + Privy |
| Trust-engine features | Security-sensitive | Backend only |

## Acceptable public/onchain data

The minimum preferred public representation is:

`opaque commitment ID`
+ `epoch`
+ `qualified/not qualified`
+ `bounded reward/confidence value if required`
+ `result hash if useful`
+ `reward settlement`

Raw evidence, verifier identities and verifier relationships must never be published.

**Cleartext behavioural commitment type is not approved by this review for automatic onchain publication.**

`STUDY_SESSIONS_SOCIAL_V1` or `ACTIVITY_COUNT_V1` is already behavioural information. An observer capable of associating a wallet with a user could infer aspects of that person's life even without seeing the underlying evidence.

Use an opaque/versioned identifier or commitment/configuration hash unless Product Lead explicitly decides that public type disclosure is acceptable.

Invisible blockchain UX must not be confused with blockchain privacy. Deposits, withdrawals and other wallet activity remain publicly observable on Monad.

---

# 3. TRUST BOUNDARIES

| Boundary | Trusted for | Must not be trusted for |
|---|---|---|
| User ↔ Privy | Authentication, wallet ownership, authorized signing | Behavioural truth |
| Kept backend | Orchestration, private metadata, proof processing | Unrestricted movement of user funds |
| Proof adapter | Producing a normalized claim | Permanent storage of unnecessary provider data |
| Social verifier | One confidence signal | Absolute truth, custody or reward authority |
| Trust engine | Deterministic qualification calculation | User-fund movement |
| Reward oracle/signer | Submitting bounded qualification results | Accessing vault principal or creating unlimited rewards |
| Privy delegated signer | Specifically authorized savings transaction | Arbitrary transfer/approval/signing authority |
| Monad contracts | Financial accounting and settlement | Raw behavioural/social interpretation |
| Aurora/NEAR Intents | Cross-chain execution | Choosing a different recipient/refund destination than the user-authorized route |

---

# 4. MVP THREAT MODEL

| ID | Threat | Severity | MVP mitigation | Residual risk |
|---|---|---:|---|---|
| P-01 | External proof leaks routes, precise timestamps, health information or locations | HIGH | Minimum OAuth scope; no route/stream requests; evaluate in memory; persist normalized result only; scrub application logs | Provider itself still holds source data |
| P-02 | Social graph becomes publicly reconstructable | HIGH | Attestations remain offchain; no verifier identity on Monad; verifier prompt does not reveal other verifiers | Kept database still contains relationship data |
| P-03 | Public commitment type reveals sensitive behavioural category | HIGH | Prefer opaque commitment ID/config hash onchain; no cleartext behavioural type without explicit approval | Wallet activity itself remains public |
| P-04 | Verifier learns unnecessary financial/personal information | HIGH | Prompt contains only subject display name, agreed commitment question and relevant period | Human relationship itself implies some context |
| P-05 | Logs/backups accidentally preserve restricted behavioural data | HIGH | Structured allow-list logging; never log OAuth bodies/raw proof responses; secret redaction | Operational mistakes remain possible |
| T-01 | Forged social attestation | HIGH | Cryptographic signature verification; resolve signer to authorized verifier; signed subject/commitment/decision | Compromised verifier account can still lie |
| T-02 | Replay of a legitimate old attestation | HIGH | Commitment ID + epoch + issuedAt + expiresAt + unique nonce; single-consumption database constraint; domain/environment binding | Backend compromise could bypass application validation unless separately audited |
| T-03 | Attestation reused for another saver/commitment | HIGH | Signed `subjectHash`, commitment ID and commitment type/version are mandatory | None meaningful if signature validation is correct |
| T-04 | Duplicate verifier votes | MEDIUM | One verifier identity contributes at most once per commitment/epoch | Multiple Sybil identities remain possible |
| A-01 | Two users repeatedly verify each other | HIGH | Reciprocity and repeated-pair penalties; insufficient confidence leads to additional verification | Genuine close relationships may be downweighted |
| A-02 | Farm creates many new accounts/verifiers | HIGH | New-account weight is weak; only top two qualifying verifier contributions count; reward economics remain capped | Patient aged Sybil accounts remain possible |
| A-03 | Closed group repeatedly verifies only its members | HIGH | Relationship diversity contributes to verifier tier; reciprocity/repeated-pair signals | MVP does not perform full graph/community detection |
| A-04 | Verifier approves everything | MEDIUM | Approval-rate aggregate is recorded as an abuse signal; not used alone to accuse/punish | Low-volume honest verifiers may legitimately approve every request |
| A-05 | Malicious verifier submits false NO | MEDIUM | Conflicting valid vote triggers additional verification rather than account punishment | Verification can be delayed |
| S-01 | Kept API exposes another user's commitment/attestation | HIGH | Object-level authorization on every user, commitment and verifier endpoint; never trust client-supplied subject IDs | Implementation defect risk |
| S-02 | Reward oracle compromised | CRITICAL | Oracle can register only bounded entitlements; treasury and per-epoch/per-user caps enforced in contract; oracle has no vault-principal authority | Treasury amount exposed up to enforced caps |
| S-03 | Privy server authorization key compromised | CRITICAL | Delegated signer limited by chain, contract, function, asset, amount, period and receiver; user can revoke; deny everything else | Attacker may force an allowed savings action up to user's cap |
| S-04 | Vault `receiver` argument is not policy-bound | CRITICAL | If `deposit(assets, receiver)` is used, policy must require receiver = user's wallet | Without this control, constrained deposits could mint shares to an attacker |
| S-05 | Delegated USDC approval is overly broad | CRITICAL | Any delegated approval must constrain spender to KeptSavingsVault and constrain amount; arbitrary `approve` must be denied | Allowance mechanics remain a dependency |
| S-06 | Scheduler bug makes unwanted automatic deposits | MEDIUM | Scheduler is never authorization authority; Privy policy enforces maximum transaction and rolling period amount; idempotency key per scheduled action | User can still receive an inconvenient but authorized deposit |
| S-07 | Authorization key leaked through git/CI/logs | CRITICAL | Environment secret only for MVP; separate keys by environment; secret scanning; never render/log key | Production requires managed KMS/HSM/rotation |
| S-08 | Cross-chain quote is altered to attacker recipient | HIGH | Recipient is fixed to user's Privy Monad wallet and validated before execution/status success | Origin wallet compromise remains outside Kept |
| S-09 | Cross-chain refund is routed to Kept | HIGH | Refund destination must normally be user-controlled; never default failed transfers to treasury | Provider-specific refund mechanics still need testing |
| S-10 | Verification service unavailable at deadline | MEDIUM | Verification state is idempotent; grace window/retry; do not convert infrastructure failure into user failure | Prolonged outage can defer settlement |
| S-11 | Challenge system causes surveillance creep | HIGH | Social MVP challenge requests another verifier; raw behavioural evidence is not a social-challenge requirement | Some claims may remain unverifiable and earn no bonus |
| S-12 | Contract/admin authority can seize savings | CRITICAL | No arbitrary admin transfer of vault principal; social/reward roles separated from savings ownership | Contract implementation requires separate contract-security review |

---

# 5. SOCIAL ATTESTATION SECURITY REQUIREMENTS

The social-verification payload already contains the right conceptual fields:

`commitmentId`  
`commitmentType/version`  
`subjectHash`  
`decision`  
`epochStart`  
`epochEnd`  
`issuedAt`  
`expiresAt`  
`nonce`

For implementation, the signed message MUST also be bound to a Kept-specific signing domain/environment so a signature collected for another application, staging environment or incompatible version cannot be accepted accidentally.

The verifier signature is accepted only when all of the following are true:

| Check | Failure behaviour |
|---|---|
| Signature cryptographically valid | Ignore attestation and request another verification |
| Signer resolves to invited verifier | Reject |
| Signer is not subject | Reject |
| Commitment ID/version matches | Reject |
| Subject hash matches | Reject |
| Epoch matches | Reject |
| `issuedAt` is plausible | Reject |
| `expiresAt` has not passed | Reject |
| Nonce has not been consumed | Reject |
| Verifier has not already voted for this commitment/epoch | Reject |
| Decision is allowed enum | Reject |

Invalid signatures are security failures, not negative verification votes.

They do not reduce the user's trust score.

---

# 6. MINIMUM VIABLE SOCIAL TRUST ENGINE

## 6.1 Inputs

The MVP engine may use only data already naturally generated by Kept:

`account age`  
`number of prior valid attestations`  
`number of distinct subjects previously verified`  
`direct reciprocity flag`  
`repeated reciprocal relationship count`  
`repeated subject/verifier pair count`  
`approval-rate aggregate`  
`unresolved challenge flag`

Kept does **not** need:

contacts,
address books,
phone metadata,
GPS proximity,
social-media graphs,
message history,
device fingerprint graphs,
or unrelated financial activity.

The purpose of the score does not justify collecting them.

---

# 6.2 Base verifier weight

The existing MVP planning constants are retained:

| Verifier state | Base weight |
|---|---:|
| New | 0.25 |
| Established/basic history | 0.40 |
| Strong independent history | 0.50 |

For deterministic MVP implementation:

**NEW**

Default state.

A verifier remains NEW when they do not yet have enough Kept history to establish independence.

**ESTABLISHED**

MVP qualification:

- Kept account at least 7 days old; and
- at least 2 prior valid attestations; and
- prior attestations cover at least 2 distinct subjects; and
- no unresolved challenge.

**STRONG_INDEPENDENT**

MVP qualification:

- Kept account at least 30 days old; and
- at least 5 prior valid attestations; and
- at least 3 distinct subjects; and
- no unresolved challenge; and
- not currently classified as strongly reciprocal with the subject.

These are **demo constants**, not scientifically calibrated reputation thresholds.

They should be server-side configuration rather than public product copy.

---

# 6.3 Relationship penalties

The planning-spec penalties are retained:

| Signal | Adjustment |
|---|---:|
| Direct reciprocal verification relationship | −0.15 |
| Very high repeated reciprocity | additional −0.10 |
| Same repeatedly used verifier pair | −0.05 |
| Minimum individual contribution | 0.05 |

Implementation interpretation:

**Direct reciprocal relationship**

The current subject has also verified this verifier during the configured lookback window.

**Very high repeated reciprocity**

The pair has repeatedly alternated/approved one another across multiple recent commitment epochs.

**Repeated pair**

The same verifier repeatedly verifies the same subject rather than the subject demonstrating reasonable verifier diversity.

Exact lookback counters must remain internal configuration.

They should not be exposed through public APIs or UX because doing so would provide a farming playbook.

---

# 6.4 Approval-rate signal

Approval rate is a weak supporting signal, not a standalone guilt mechanism.

An unusually high YES rate may become relevant when combined with:

reciprocity,
low network diversity,
repeated pairs,
or challenge failures.

The MVP MUST NOT automatically penalize a low-volume verifier merely for approving 100% of a small number of legitimate requests.

This avoids punishing normal friends or family members who are only invited when the user actually completes the commitment.

---

# 6.5 Individual verifier contribution

For a valid YES attestation:

`adjustedWeight = max(0.05, baseWeight - applicable relationship penalties)`

A valid NO attestation does not contribute positive weight.

A cryptographically invalid attestation contributes nothing and is treated separately from a NO.

---

# 6.6 Combined social confidence

For `STUDY_SESSIONS_SOCIAL_V1`:

- invite 3 verifiers where practical;
- require at least 2 distinct valid YES attestations;
- count at most the two highest adjusted YES contributions toward initial qualification;
- cap combined confidence at 1.0.

Therefore:

`confidence = min(1.0, topYesWeight1 + topYesWeight2)`

Qualification threshold:

`confidence >= 0.65`

This preserves the existing MVP threshold while preventing "invite enough 0.25 Sybil accounts" from simply accumulating unlimited confidence.

Examples:

### Established independent pair

Verifier A = 0.40  
Verifier B = 0.40

Confidence:

`0.80`

Result:

**QUALIFIED**

### New independent pair

Verifier A = 0.25  
Verifier B = 0.25

Confidence:

`0.50`

Result:

**ADDITIONAL VERIFICATION REQUIRED**

### New reciprocal pair

Verifier A:

`0.25 - 0.15 = 0.10`

Verifier B:

`0.25 - 0.15 = 0.10`

Confidence:

`0.20`

Result:

**ADDITIONAL VERIFICATION REQUIRED**

### Established + new independent

Verifier A = 0.40  
Verifier B = 0.25

Confidence:

`0.65`

Result:

**QUALIFIED**

This is deliberately simple enough for QA to create deterministic fixtures.

---

# 7. CONFLICTING VERIFIER RESPONSES

A valid NO must not be silently ignored.

If at least one valid verifier votes NO while the user otherwise has enough YES confidence, the commitment moves to:

**CHALLENGED**

User-facing state:

**Additional verification required**

rather than:

**Fraud detected**

or:

**You lied**

For the MVP, the first challenge mechanism is another independent verifier.

Raw evidence is not required for the study-session social commitment.

The system is allowed to conclude that it could not obtain sufficient confidence and therefore no behavioural bonus is payable for the epoch.

That is materially different from concluding that the user committed fraud.

---

# 8. DETERMINISTIC RESULT RULES

### QUALIFIED

All are true:

- at least 2 valid YES attestations;
- YES attestations come from distinct verifiers;
- combined confidence ≥ 0.65;
- no unresolved conflicting NO;
- no hard-invalid account/signature condition.

### ADDITIONAL_VERIFICATION_REQUIRED / CHALLENGED

Any of:

- two YES attestations exist but confidence < 0.65;
- valid conflicting NO exists;
- strong reciprocity/repeated-pair signals reduce confidence;
- verifier set does not provide adequate independence.

### NOT_QUALIFIED

At verification deadline:

- fewer than 2 valid YES attestations; or
- challenge remains unresolved; or
- confidence remains below 0.65.

No banning is implied.

### INVALID_ATTESTATION

A signature/account/payload rule failed.

The invalid attestation is discarded and does not count as YES or NO.

---

# 9. WHAT GOES ONCHAIN

The trust engine should produce a normalized settlement object such as:

`commitmentId`  
`epoch`  
`qualified`  
`confidence/rewardWeight`  
`resultHash`

Before signing/submitting the result, the backend must reproduce the calculation deterministically from stored valid inputs.

Monad does not need:

verifier identity,
individual verifier scores,
reciprocity flags,
approval rates,
account age,
relationship history,
raw attestations,
or proof-adapter evidence.

---

# 10. REWARD-ORACLE SECURITY REQUIREMENT

The authorized reward qualification signer is a major MVP trust assumption.

Compromise must not grant authority over saver principal.

At contract level, the oracle should be capable only of registering/settling rewards within already funded constraints.

Required technical bounds:

- behavioural rewards drawn only from the separate reward treasury;
- epoch cannot distribute more than funded epoch amount;
- per-user reward is capped;
- per-commitment reward is capped;
- qualification can be consumed only once;
- duplicate claims impossible;
- oracle cannot withdraw from KeptSavingsVault;
- oracle cannot change ownership of vault shares;
- oracle cannot redirect saver withdrawals;
- emergency disabling of reward qualification must not freeze saver withdrawals.

The worst credible oracle compromise should therefore be:

**misallocation of the bounded behavioural reward treasury**

not:

**loss of saver principal**.

---

# 11. PRIVY DELEGATED-SIGNER SECURITY REQUIREMENT

The Product Lead has already made restrictive delegated automatic saving an MVP requirement.

The security model must assume the Kept scheduler or authorization key could fail or be compromised.

Policy therefore must constrain authorization independently.

At minimum:

`chain == Monad / 143`

`destination == approved Kept savings flow`

`function == approved deposit function`

`asset == native Monad USDC`

`amount <= user-approved maximum`

`rolling-period amount <= user-approved cap`

`receiver == user's own Kept wallet`

`all unrelated actions == denied`

If a separate ERC-20 approval is performed through delegation:

`spender == KeptSavingsVault`

and approval amount must itself be bounded.

This detail matters.

A policy that merely permits:

`deposit <= 25 USDC`

is **not sufficient** when the vault function accepts a freely selectable `receiver`.

A compromised backend could potentially deposit the user's funds while minting vault shares to an attacker.

The receiver argument must therefore also be policy-bound.

Likewise, a policy permitting arbitrary calls to USDC `approve()` would defeat the intended safety model even if the subsequent vault deposit were constrained.

The intentionally rejected hackathon action should test one of these meaningful boundaries, not merely an obviously unrelated RPC call.

---

# 12. EXTERNAL PROOF ADAPTER PRIVACY RULE

For the MVP activity adapter, Kept requires the predicate:

**eligible activity count during epoch**

It does not inherently require:

route,
GPS,
heart rate,
photos,
social comments,
exact venue,
activity title,
or precise movement history.

The adapter contract should therefore be:

`raw provider data`
→ evaluate eligibility in memory
→ produce normalized count/result
→ discard unused provider data

Normalized result:

`commitmentType/version`
`period`
`requiredCount`
`observedEligibleCount`
`qualified`
`provider`
`proofVersion`

Nothing else should be retained merely because the provider returned it.

OAuth scope expansion requires Privacy/Security review.

---

# 13. FALSE-POSITIVE POLICY

Anti-abuse controls must not become punitive social scoring.

Expected legitimate false-positive cases include:

- a couple who naturally verifies each other;
- a parent repeatedly verifying a child;
- two study partners;
- a new legitimate Kept user;
- a small group with little network diversity;
- a verifier who genuinely says YES almost every time.

The MVP response to weak confidence is:

**Additional verification required**

not automatic accusation or banning.

Rewards can be withheld when required confidence is absent.

User access to their existing savings must not depend on the social trust score.

---

# 14. DEMO FIXTURES REQUIRED

QA/backend should seed at least these deterministic cases:

| Fixture | Expected outcome |
|---|---|
| Two established independent verifiers | QUALIFIED |
| Established + new independent verifier | QUALIFIED at threshold |
| Two new independent verifiers | ADDITIONAL VERIFICATION REQUIRED |
| Two new reciprocal verifiers | ADDITIONAL VERIFICATION REQUIRED |
| Established reciprocal pair with repeated-pair penalties | Below normal independent confidence |
| Duplicate signature/nonce | Second attestation rejected |
| Attestation for wrong commitment | Rejected |
| Expired attestation | Rejected |
| Subject signs own attestation | Rejected |
| Valid YES + valid conflicting NO | CHALLENGED |
| Replayed previous-epoch attestation | Rejected |
| Out-of-policy delegated transfer | Privy rejects |
| Allowed automatic savings deposit | Executes |
| Allowed amount but attacker-controlled vault receiver | Privy policy rejects |
| Reward qualification submitted twice | Second settlement rejected |

---

# 15. PRODUCTION GAPS — EXPLICITLY NOT SOLVED BY MVP

The following remain production work:

full Sybil resistance;
device/account-link analysis;
graph/community collusion analysis;
production fraud operations;
selective-disclosure/ZK proofs;
independent reward-oracle architecture;
formal key-management/HSM design;
production retention/deletion schedule;
external-provider privacy/legal review;
third-party security audit;
incident-response programme;
advanced account recovery abuse analysis;
privacy-preserving auditability/Merkle commitments;
production challenge/dispute process;
calibrated verifier reputation.

The MVP must not market its simple confidence score as solving these problems.

---

# 16. DECISIONS MADE WITHIN PRIVACY / SECURITY AUTHORITY

1. The social MVP uses the existing 0.25 / 0.40 / 0.50 verifier weight structure.
2. Existing reciprocity/repeated-pair penalties are retained.
3. Qualification requires two distinct YES attestations and confidence ≥ 0.65.
4. Only the two strongest verifier contributions count toward initial confidence.
5. Conflicting valid NO responses trigger additional verification rather than punishment.
6. Invalid cryptographic attestations are ignored rather than treated as NO.
7. Approval rate is only a supporting signal in the MVP.
8. Social trust affects behavioural-reward qualification only; it never affects withdrawal rights or ownership of savings.
9. No additional social/contact/device data should be collected for trust scoring.
10. Raw evidence is not part of the MVP social challenge flow.

# 17. ASSUMPTIONS

The study-session commitment remains the sole social-verification reward commitment in MVP.

Three verifiers may be invited, with two approvals required.

The backend can resolve verifier identities to authenticated Kept/Privy users or another explicitly authenticated invitation identity.

Behavioural reward exposure is small and pre-funded.

Reward settlement and savings principal remain separate.

# 18. BLOCKERS

No blocker prevents implementation of the social-verification demo.

Two architecture/privacy decisions require Product Lead confirmation before contract interfaces are frozen:

1. whether cleartext behavioural commitment types may appear onchain;
2. whether RewardController's qualification role will be contractually bounded as specified above.

# 19. DEPENDENCIES

Backend must implement signed-attestation verification, nonce consumption, relationship aggregates and deterministic trust calculation.

Wallet/Privy must implement delegated policies against the exact deployed vault ABI, including receiver/spender constraints.

Contracts must enforce reward treasury/epoch/idempotency caps without granting the reward signer saver-principal authority.

Product/UX must use “Additional verification required” for low-confidence or conflicting social verification.

QA must implement the deterministic fixtures in Section 14.

# 20. ITEMS REQUIRING PRODUCT LEAD APPROVAL

**Approval 1:** Make behavioural commitment type private/opaque onchain by default.

**Approval 2:** Make bounded reward-oracle authority an explicit MVP contract acceptance criterion.