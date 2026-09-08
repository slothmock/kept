# Kept

**Keep your commitments. Grow your savings.**

Kept is a privacy-first behavioural savings product built on Monad.

Users create a savings goal, add money, choose from predefined commitments, verify completion, and earn an additional behavioural reward for following through.

Kept is designed to feel like a consumer savings product rather than a DeFi application. Blockchain infrastructure should remain invisible in normal use.

---

## Product thesis

Traditional savings products mainly reward capital already deposited.

Kept adds a behavioural incentive layer:

**Create savings goal  
→ Add money  
→ Select predefined commitment  
→ Complete commitment  
→ Verify completion  
→ Earn additional behavioural reward  
→ Build consistency and save more**

Base yield and behavioural rewards are separate.

- **Base yield** comes from the underlying savings strategy.
- **Behavioural rewards** are additional, bounded incentives funded separately.
- Missing a commitment does not remove legitimately earned base yield.
- Users retain control of their savings.

Core proof principle:

> **Prove enough to qualify. Reveal as little as possible.**

Core commitment principle:

> **Users choose commitments. Kept defines proof.**

---

## MVP

The MVP is intentionally narrow.

It supports exactly three initial reward-bearing commitment types representing Kept's three core verification paths:

1. **Weekly savings**
   - Verification: objective / onchain.
   - Example: save a defined amount during the week.

2. **Verified activity count**
   - Verification: external proof adapter.
   - Example: complete a defined number of qualifying activity sessions.

3. **Study sessions**
   - Verification: private social verification.
   - Example: complete a defined number of study sessions, confirmed by trusted verifiers.

The goal is to prove the full architecture rather than maximize feature breadth.

---

## Financial architecture

### Savings asset

Kept's intended MVP savings asset is native USDC on Monad.

### Base yield

The initial yield strategy is:

```text
User USDC
→ KeptSavingsVault
→ IYieldStrategy
→ AaveUSDCStrategy
→ Aave V3 Monad
```

The MVP uses one Aave USDC strategy.

`IYieldStrategy` remains the abstraction boundary, but runtime strategy switching, optimization, and a strategy marketplace are outside MVP scope.

### Behavioural rewards

Behavioural rewards come from a bounded, pre-funded USDC reward pool.

There is no protocol token.

The reward system is financially isolated from saver principal and base yield.

---

## Onchain boundary

The MVP contract graph is deliberately small:

```text
KeptSavingsVault
AaveUSDCStrategy
RewardController
```

There is no standalone MVP `CommitmentRegistry`.

Private commitment definitions, lifecycle, proof context, verifier relationships, and social verification remain offchain.

`RewardController` is the authoritative onchain enforcement point for:

- reward budgets;
- reward caps;
- replay protection;
- bounded qualification inputs;
- final reward settlement.

It must not have authority over saver principal or vault shares.

---

## Privacy model

Kept should not place sensitive behavioural or social information onchain simply because it can.

Private or minimized data includes:

- personal goal context;
- raw evidence;
- exact locations;
- social relationships;
- verifier identities;
- sensitive behavioural metadata.

The trust/proof layer reduces private evidence to a minimal financial claim.

Conceptually:

```text
Private behavioural evidence
→ Proof adapter / trust engine
→ Minimal qualification result
→ Monad settlement
```

Onchain identifiers should be opaque and non-semantic by default.

Do not emit cleartext behavioural commitment types, verifier identities, or raw evidence onchain.

---

## Social verification

Social verification is one confidence input, not unquestionable truth.

The MVP trust layer is designed to demonstrate:

- valid independent verification can qualify;
- weak or reciprocal verification can fail;
- suspicious or low-confidence cases can require more verification.

Preferred response to uncertainty:

> **Additional verification required**

Social relationships provide accountability only. They never provide custody or control over another user's funds.

---

## Accounts and authorization — Privy

Privy is a core account, authorization, security, transaction, and automation dependency.

The MVP is intended to demonstrate Privy beyond authentication through:

- embedded Monad accounts;
- sponsored Monad transactions;
- restrictive delegated automatic saving;
- wallet policy controls;
- a deliberately rejected out-of-policy action.

Removing Privy should materially break important product functionality.

### Delegated automatic saving

Authority is layered.

Privy policy should restrict:

- chain;
- authorized vault;
- authorized function;
- asset;
- per-transaction amount;
- receiver/spender semantics.

`KeptSavingsVault` additionally enforces:

- no more than one delegated automatic deposit per wallet every rolling seven days.

The backend scheduler only decides **when to request** an action.

It is never the authorization boundary.

---

## Cross-chain funding — Aurora / NEAR Intents

The MVP uses a two-stage cross-chain flow:

```text
Origin-chain asset
→ Aurora / NEAR Intents
→ Native USDC in user's Monad account
→ Privy-sponsored Monad transaction
→ KeptSavingsVault
→ Aave strategy
```

The user-facing action remains:

> **Add money**

The normal consumer experience should not expose bridge, solver, gas, or chain-ID terminology.

Direct deposit-and-execute may be explored later, but it is not the primary MVP path.

---

## Repository structure

```text
kept/
├── apps/
│   ├── api/
│   └── web/
├── docs/
│   ├── 01 - Product Lead/
│   ├── 02 - Product Designer/
│   ├── 03 - Monad + Smart Contract Engineer/
│   ├── 04 - Wallet & Cross-Chain Engineer/
│   ├── 05 - Backend, Data, Verification Engineer/
│   ├── 06 - Privacy, Trust & Security Lead/
│   ├── 07 - Economic, Risk & Regulatory Research Lead/
│   ├── 08 - QA, Hackathon, Release Lead/
│   └── Product-Outline.txt
├── packages/
│   ├── commitment-catalogue/
│   ├── contracts/
│   ├── intents-client/
│   ├── proof-adapters/
│   ├── shared/
│   └── trust-engine/
├── AGENTS.md
└── README.md
```

### Apps

`apps/web`
- consumer-facing Kept application.

`apps/api`
- backend API and orchestration layer.

### Packages

`packages/contracts`
- Solidity contracts;
- Foundry tests;
- deployment tooling.

`packages/commitment-catalogue`
- machine-readable predefined commitment definitions.

`packages/intents-client`
- Aurora / NEAR Intents integration.

`packages/proof-adapters`
- normalized external proof interfaces and adapters.

`packages/shared`
- shared types and utilities.

`packages/trust-engine`
- MVP trust/confidence logic.

---

## Source of truth

Repository documents are not all equally authoritative.

Use this hierarchy:

1. `docs/01 - Product Lead/Product Lead Decision Log.txt`
2. `docs/Product-Outline.txt`
3. current accepted implementation specifications
4. current specialist deliverables
5. specialist handoffs
6. historical research
7. general knowledge / new ideas

If a specialist handoff conflicts with an accepted Product Lead decision, the Product Lead decision controls.

See [`AGENTS.md`](./AGENTS.md) for the full implementation rules.

---

## Current accepted Product Lead decisions

The repository decision log is authoritative.

As of 08-Sep-2026, accepted decisions include:

- **KEPT-PL-001** — exactly three MVP reward-bearing verification paths.
- **KEPT-PL-002** — restrictive delegated automatic saving is MVP scope.
- **KEPT-PL-003** — use the two-stage Aurora / NEAR Intents flow.
- **KEPT-PL-004** — native Monad USDC supplied to Aave V3 through a strategy abstraction.
- **KEPT-PL-005** — bounded pre-funded USDC behavioural reward treasury; no token.
- **KEPT-PL-006** — no standalone MVP `CommitmentRegistry`.
- **KEPT-PL-007** — qualification authority is separated from reward economics.
- **KEPT-PL-008** — no runtime strategy switching required in MVP.
- **KEPT-PL-009** — delegated saving uses layered authorization, including vault-enforced rolling seven-day cadence.
- **KEPT-PL-010** — onchain behavioural identity is opaque by default.
- **KEPT-PL-011** — Consumer Products & Payments is the intended primary Metropolis track.
- **KEPT-PL-012** — reward-oracle and delegated-wallet authority must remain independently bounded.
- **KEPT-PL-013** — the current backend/data/verification design is the MVP backend implementation baseline.

Newer accepted decisions in the decision log override this README summary.

---

## Development workflow

Kept uses Git as the local history and change-control layer.

Recommended flow:

```text
Specialist discovers issue
→ Product Lead accepts/rejects decision
→ Decision log updated
→ Relevant canonical spec updated
→ Implementation
→ Tests
→ Commit
```

Do not treat handoff documents as final implementation authority.

### AI-assisted development

AI coding agents must read [`AGENTS.md`](./AGENTS.md) before making changes.

Material architecture conflicts should be escalated rather than silently resolved by the coding agent.

The first Hermes pass should be read-only and produce an Implementation Readiness Report before code generation begins.

---

## Development status

Kept is currently transitioning from planning into implementation.

The repository contains:

- product definition;
- accepted Product Lead decisions;
- specialist architecture and research outputs;
- backend/data/verification specification;
- privacy/security specification;
- repository-level AI instructions.

Application and contract scaffolding may still be incomplete.

Do not infer implementation readiness merely from the presence of directories.

---

## Testing expectations

MVP-critical functionality should include:

- unit tests;
- integration tests;
- contract fork tests where appropriate;
- failure-state tests;
- privacy checks;
- authorization-boundary tests;
- adversarial reward tests;
- delegated-saving out-of-policy rejection tests.

Important security acceptance criteria include:

- compromised backend qualification authority cannot access saver principal;
- reward settlement cannot exceed bounded pre-funded reward authority;
- delegated wallet permissions cannot redirect funds;
- backend scheduling alone cannot bypass wallet/vault authorization;
- replay or duplicate reward settlement is rejected.

---

## Security

Do not commit:

- private keys;
- seed phrases;
- Privy authorization-key private material;
- OAuth client secrets;
- production RPC secrets;
- database passwords;
- `.env` files containing secrets.

Use controlled development accounts and small values for eventual mainnet testing.

Kept's MVP is not production-audited financial software.

---

## Hackathon

Kept is being built for the Monad Metropolis hackathon while remaining product-first.

Primary intended track:

**Consumer Products & Payments**

Target sponsor integrations:

- **Privy** — materially beyond authentication.
- **Aurora / NEAR Intents** — genuine cross-chain liquidity into the Monad product.

The hackathon should demonstrate a real end-to-end savings loop, not a collection of disconnected sponsor integrations.

---

## Product principles

1. Blockchain should be invisible.
2. Users choose commitments; Kept defines proof.
3. Privacy is the default.
4. Base yield and behavioural rewards are separate.
5. Incentives should encourage rather than punish.
6. Abuse should be uneconomic.
7. Social relationships provide accountability, never custody.
8. Sensitive evidence should be reduced to minimal claims.
9. Do not add a token without a genuine product requirement.
10. Build a real product first and a hackathon submission second.

---

## Product statement

Kept is a privacy-first behavioural savings product where users save toward goals and select predefined real-world commitments that can increase their rewards when credibly completed.

Privy makes account and Monad interactions feel like normal consumer fintech.

Aurora / NEAR Intents makes the chain holding the user's existing crypto largely irrelevant.

Monad provides financial settlement.

A privacy-preserving proof and trust layer connects real-life action to financial incentives without unnecessarily exposing the user's personal behaviour or social graph.

**Save money.  
Keep your commitments.  
Earn more for following through.**
