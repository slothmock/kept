# Kept — Repository Instructions for AI Coding Agents

## 1. Mission

Kept is a privacy-first behavioural savings product on Monad.

Core loop:

Create savings goal
→ Add money
→ Select a predefined commitment
→ Complete it
→ Verify completion
→ Earn an additional behavioural reward
→ Build consistency and save more

Kept must feel like a consumer savings product, not a DeFi application. Blockchain is infrastructure, not the product.

This file is the root implementation constitution for AI agents working in this repository.

## 2. Source-of-truth hierarchy

When repository documents conflict, use this order:

1. `docs/01 - Product Lead/Product Lead Decision Log.txt`
2. `docs/Product-Outline.txt`
3. Current accepted implementation specifications under `docs/`
4. Current specialist deliverables/specifications
5. Specialist handoffs
6. Historical research/reference material
7. General knowledge
8. New ideas

Never silently override a higher-priority source with a lower-priority one.

If a lower-priority document conflicts with an accepted Product Lead decision:
- follow the Product Lead decision;
- report the stale/conflicting document;
- do not average the two positions.

If the decision log is extended beyond the decisions summarized in this file, the newer accepted decision controls.

## 3. Product invariants

Preserve these unless the Product Lead explicitly changes them:

1. Blockchain should be invisible in normal consumer UX.
2. Users choose commitments; Kept defines proof.
3. Privacy is the default.
4. Base yield and behavioural rewards are separate.
5. Incentives encourage rather than punish.
6. Abuse should be made uneconomic rather than assumed impossible.
7. Social relationships provide accountability, never custody.
8. Sensitive evidence should be reduced to minimal claims wherever possible.
9. Do not add a protocol token unless a genuine product requirement is explicitly accepted.
10. Build a real product first and a hackathon submission second.
11. Users retain control of their savings and can withdraw, subject to genuine underlying liquidity/settlement constraints.
12. Do not hide material financial, privacy, authorization, or liquidity consequences behind invisible-blockchain UX.

## 4. Current accepted MVP

### Verification breadth

The MVP has exactly three initial reward-bearing commitment types:

1. Objective/onchain:
   - weekly savings commitment.

2. External proof adapter:
   - verified activity-count commitment.

3. Social:
   - study-session commitment using private social verification.

Do not add additional reward-bearing MVP commitment types without Product Lead approval.

### Savings asset and yield

- Settlement/execution chain: Monad.
- Intended savings asset: native Monad USDC.
- Initial base-yield source: Aave V3 Monad USDC.
- Preserve `IYieldStrategy` as the architectural abstraction boundary.
- MVP deployment uses one Aave USDC strategy.
- Runtime strategy switching/optimizer/marketplace is not an MVP requirement.

### Behavioural rewards

- Base yield and behavioural rewards are financially separate.
- Behavioural rewards are paid from a bounded, pre-funded USDC reward pool.
- No token emissions.
- No loser-funded reward pool.
- `RewardController` is the authoritative onchain enforcement point for reward budgets, caps, replay protection, and final reward settlement.
- Backend/trust services submit bounded qualification inputs, not arbitrary payout authority.
- `RewardController` must have no authority over saver principal or vault shares.

## 5. Accepted MVP onchain boundary

The MVP contract graph is deliberately small.

Expected deployed financial components:

- `KeptSavingsVault`
- one Aave USDC strategy implementation behind `IYieldStrategy`
- `RewardController`

There is no standalone MVP `CommitmentRegistry`.

Private commitment definitions, lifecycle, proof context, verifier relationships, and social verification remain offchain.

Do not introduce a fourth deployed automation contract unless the Product Lead explicitly changes the architecture.

### Behavioural privacy onchain

Do not emit or store semantic behavioural labels onchain by default.

Monad should receive only:
- opaque/versioned commitment or qualification identifiers; and
- the minimum financially relevant fields required for settlement.

Do not put cleartext commitment types, verification classes, raw evidence, or verifier identities into contract storage/events by default.

## 6. Delegated automatic saving

Restrictive delegated automatic saving is an MVP/hackathon requirement.

Authority is layered:

### Privy policy

The delegated policy must bind, as supported by the current integration:
- Monad / permitted chain;
- authorized Kept vault;
- authorized function;
- asset;
- per-transaction amount;
- receiver/spender semantics so funds cannot be redirected.

### KeptSavingsVault

The vault must strictly enforce the accepted MVP cadence for the automation-specific path:
- no more than one delegated automatic deposit per wallet every rolling seven days.

### Backend

The backend scheduler:
- decides when to request an automatic deposit;
- is a trigger only;
- is never an authorization boundary.

The MVP must include an intentionally unsafe/out-of-policy delegated action and demonstrate that it is rejected.

Do not weaken these claims to scheduler-only enforcement.

## 7. Cross-chain funding

MVP uses the accepted two-stage Aurora / NEAR Intents flow:

origin-chain asset
→ Aurora / NEAR Intents
→ native USDC in the user's Privy Monad wallet
→ Privy-sponsored Monad transaction
→ `KeptSavingsVault`
→ Aave strategy

Do not change the primary MVP path to direct deposit-and-execute without Product Lead approval.

Cross-chain UX should remain an Add money flow. Do not expose bridge/solver jargon in normal consumer screens.

Do not claim a transfer is complete until the destination state is actually settled.

Refund/recovery handling must not casually route user funds through a Kept treasury.

## 8. Backend authority and implementation baseline

The accepted MVP backend baseline is the current backend/data/verification specification under:

`docs/05 - Backend, Data, Verification Engineer/`

Backend implementation may proceed where interfaces are stable.

The backend may own:
- user-facing private metadata;
- goal display metadata;
- private commitment lifecycle;
- commitment catalogue data;
- verifier relationships;
- offchain attestations;
- external proof-adapter orchestration;
- normalized proof results before chain submission;
- trust/confidence computation;
- cross-chain transfer persistence;
- jobs/scheduling;
- indexing and operational state.

Onchain remains authoritative for:
- actual funds;
- vault shares;
- final onchain reward settlement.

Do not create an offchain ledger that pretends to be authoritative over user principal.

### Provisional boundaries

Until Contracts and Privacy/Security explicitly finalize them, keep these behind interfaces and avoid unnecessary coupling:
- `RewardController` ABI details;
- `KeptSavingsVault` ABI details;
- exact EIP-712 typed-data fields/domain;
- contract event shapes;
- qualification payload cryptographic fields.

Do not prematurely freeze provisional fields merely to make implementation convenient.

## 9. Privacy and proof handling

Use the principle:

**Prove enough to qualify. Reveal as little as possible.**

Raw behavioural evidence should not be persisted by default.

Every external proof adapter must document:
- provider/scopes used;
- raw fields accessed;
- fields actually required;
- normalized output;
- whether raw data is stored;
- retention duration;
- deletion behavior.

Preferred normalized output is a minimal claim such as:

`COMMITMENT_SATISFIED = TRUE`

rather than a copied behavioural dataset.

Do not expose:
- exact location;
- route/GPS history;
- unnecessary timestamps;
- health data;
- private social graph;
- unrelated financial information;
- verifier identities

unless an accepted requirement genuinely needs it.

Social verifiers are signals, not custody holders or unquestionable oracles.

Low-confidence/suspicious social verification should prefer:
`Additional verification required`
over punitive accusations when the evidence is uncertain.

The MVP trust engine is a bounded demonstration, not a claim to solve generalized Sybil resistance.

## 10. Privy and sponsor requirements

Privy is infrastructure beyond authentication.

The implementation must materially demonstrate functionality beyond login, including the accepted MVP delegated-authorization flow and sponsored Monad interactions.

Aurora / NEAR Intents must genuinely move liquidity from another supported chain into the Kept flow.

Do not mock either sponsor integration and represent it as real.

When implementation depends on current sponsor SDK/API behavior:
- verify against current official documentation;
- record the SDK/package version used;
- distinguish confirmed behavior from assumptions;
- escalate any conflict between current sponsor capabilities and accepted Kept behavior.

## 11. Hackathon positioning

Primary intended Monad Metropolis track:
- Consumer Products & Payments.

Do not reposition Kept as social-first merely to fit Social, Attention & Culture.

Social verification remains one of three proof paths, not the core product category.

Target sponsor bounties remain:
- Privy;
- Aurora / NEAR Intents;

subject to final eligibility/submission-form verification.

## 12. Repository boundaries

Current repository layout:

- `apps/web` — consumer web application.
- `apps/api` — backend/API application.
- `packages/contracts` — Solidity contracts, tests, deployment tooling.
- `packages/commitment-catalogue` — machine-readable predefined commitment definitions.
- `packages/intents-client` — Aurora / NEAR Intents integration.
- `packages/proof-adapters` — normalized external proof-adapter interfaces/implementations.
- `packages/shared` — shared types/utilities that are genuinely cross-package.
- `packages/trust-engine` — MVP trust/confidence logic.
- `docs` — product decisions, specifications, handoffs, research.

Do not create new top-level services/packages unless there is a concrete need.

Avoid premature microservices.

Keep dependency direction clear and avoid circular imports between packages.

## 13. Engineering rules

### General

- Inspect before editing.
- Prefer small, reviewable changes.
- Do not rewrite unrelated code.
- Do not change architecture simply because another architecture is more familiar.
- Do not add dependencies without a concrete reason.
- Do not put secrets, private keys, authorization keys, production credentials, or wallet material in source control.
- Do not commit `.env` files containing secrets.
- Do not use meaningful personal funds in automated tests.

### Contracts

Prefer:
- minimal state;
- standard OpenZeppelin components where suitable;
- explicit access control;
- `SafeERC20`;
- clear events;
- unit tests;
- fuzz/invariant tests where valuable;
- Monad/Aave fork tests before live-value testing.

Tests must cover adversarial authority boundaries, not just happy paths.

### Backend

Require:
- schema migrations;
- idempotency for externally retried actions;
- explicit state machines;
- replay protection where applicable;
- validation at trust boundaries;
- structured error handling;
- deterministic demo fixtures.

### Frontend

Use ordinary consumer-finance language.

Prefer:
- Account
- Add money
- Withdraw
- Savings
- Goal
- Commitment
- Verify
- Rewards
- Automatic saving

Avoid normal-flow jargon such as:
- wallet
- bridge
- gas
- chain ID
- smart contract
- attestation
- solver
- paymaster

Do not hide material risk or authorization consequences.

## 14. Definition of done

An MVP-critical feature is not done merely because its code exists.

Done means, where applicable:
- accepted requirement mapped to implementation;
- integration with dependent components;
- happy path tested;
- meaningful failure states tested;
- security/authority boundaries tested;
- privacy behavior checked;
- user-visible state verified;
- no unresolved critical blocker;
- demo path documented.

For delegated automatic saving, include an adversarial/out-of-policy rejection test.

For rewards, verify that a compromised qualification/backend role cannot access principal and cannot exceed bounded reward authority.

## 15. Change control and escalation

Do not independently redefine:
- Kept's product thesis;
- privacy principles;
- base-vs-behavioural reward separation;
- the three MVP commitment types;
- user custody/control assumptions;
- primary contract graph;
- reward authority model;
- delegated-automation authority model;
- primary cross-chain architecture;
- product-wide terminology.

When implementation reveals a material conflict, stop that branch of work and report:

### KEPT IMPLEMENTATION ESCALATION

**Type:** DECISION | BLOCKER | RISK | DEPENDENCY  
**Priority:** LOW | MEDIUM | HIGH | CRITICAL

**Summary:**  
[What was discovered.]

**Affected accepted decision(s):**  
[KEPT-PL-xxx]

**Evidence:**  
[Code/docs/current official external behavior.]

**Recommendation:**  
[Preferred resolution.]

**Alternatives:**  
- ...
- ...

**Cross-component impact:**  
- Web:
- API:
- Contracts:
- Wallet/Intents:
- Proof/Trust:
- Privacy/Security:
- QA:

**Can unaffected work continue?**  
Yes/No — [explain.]

Do not silently choose a cross-functional product answer.

## 16. First-run rule for Hermes or another coding coordinator

If the repository does not yet contain an accepted implementation-readiness plan, the first run must be read-only.

The agent should:
- inspect the repository;
- read the source-of-truth documents;
- identify stale/conflicting documents;
- map accepted decisions to code boundaries;
- identify interfaces that are stable vs provisional;
- produce a dependency-ordered implementation plan;
- propose the smallest first implementation milestone.

It must not:
- edit files;
- install packages;
- generate scaffolding;
- run migrations;
- deploy contracts;
- create credentials;
- make network transactions;
- commit changes

until the plan has been reviewed and implementation is explicitly authorized.

## 17. Current decision snapshot

The root agent must respect all accepted decisions in the Product Lead decision log. As of 08-Sep-2026 this includes, at minimum:

- KEPT-PL-001 — exactly three MVP reward-bearing verification paths.
- KEPT-PL-002 — restrictive delegated automatic saving is MVP scope.
- KEPT-PL-003 — two-stage Aurora/NEAR Intents flow.
- KEPT-PL-004 — native Monad USDC → Aave V3 via strategy abstraction.
- KEPT-PL-005 — bounded pre-funded USDC behavioural reward treasury; no token.
- KEPT-PL-006 — no standalone MVP CommitmentRegistry.
- KEPT-PL-007 — qualification authority separated from reward economics.
- KEPT-PL-008 — no runtime strategy switching required in MVP.
- KEPT-PL-009 — layered delegated-saving enforcement; vault enforces rolling seven-day cadence.
- KEPT-PL-010 — opaque onchain behavioural identity.
- KEPT-PL-011 — Consumer Products & Payments is the primary intended track.
- KEPT-PL-012 — bounded reward-oracle and delegated-authority security acceptance criteria.
- KEPT-PL-013 — Wave 2 backend/data/verification design is the MVP backend implementation baseline.

The decision log itself outranks this summary if newer accepted decisions exist.
