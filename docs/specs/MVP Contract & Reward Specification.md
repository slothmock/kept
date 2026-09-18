# Kept MVP Contract & Reward Design Freeze — 08-Sep-2026

## 1. Freeze status

This document freezes the MVP contract and reward design required for Milestone 3.

The existing accepted architecture requires bounded reward authority, no standalone CommitmentRegistry, opaque behavioural identifiers, explicit user authorization for savings deposits, and strict separation between saver principal, platform yield fees and the behavioural treasury. The Product Outline also requires user-controlled withdrawals, time-weighted eligible capital, a bounded pre-funded behavioural reward, and minimum-disclosure onchain state.

> **Post-Milestone 3 governance update:** KEPT-PL-021 supersedes the single-vault topology with separate standard Aave and enhanced stablecoin-LP vaults. KEPT-PL-022 adds bounded positive-yield fee accounting. KEPT-PL-023 removes delegated and scheduled automatic saving from the MVP and supersedes every automation-specific requirement retained in the historical Milestone 3 sections below. The standard Aave vault may now implement the accepted fee model. The enhanced strategy, pair, liquidity and withdrawal mechanics remain unselected and are not authorized for implementation by this specification.

| ItemStatusResolution                           |                 |                                                                                                                                                                     |
| ---------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract topology                              | **FROZEN**      | Exactly three deployed Kept contracts.                                                                                                                              |
| ERC-4626 saver accounting                      | **FROZEN**      | Standard deposit/mint/withdraw/redeem retained.                                                                                                                     |
| Vault ↔ strategy binding                       | **FROZEN**      | Strategy is permanently bound after a one-time pre-deposit bind.                                                                                                    |
| Savings authorization                           | **SUPERSEDED**  | KEPT-PL-023 removes `depositAutomatically` and requires explicit user-authorized ERC-4626 deposits.                                                                  |
| Saver withdrawal availability under Kept pause | **FROZEN**      | Kept pause never disables withdraw/redeem.                                                                                                                          |
| `IYieldStrategy` semantics                     | **FROZEN**      | Exact minimal interface defined below.                                                                                                                              |
| Aave strategy authority                        | **FROZEN**      | Vault-only asset-moving caller; no rescue/admin withdrawal.                                                                                                         |
| RewardController role model                    | **FROZEN**      | OpenZeppelin AccessControl with separated roles.                                                                                                                    |
| Qualification boundary                         | **FROZEN**      | Positive opaque qualifications only; backend supplies bounded inputs, not payout amount.                                                                            |
| Reward arithmetic                              | **FROZEN**      | Weekly period rate, TWAB, confidence, reward weight, floor rounding.                                                                                                |
| Immutable hard ceilings                        | **FROZEN**      | Explicit values in §10.                                                                                                                                             |
| Initial demo reward parameters                 | **FROZEN**      | Explicit values in §10.                                                                                                                                             |
| Reward epochs                                  | **FROZEN**      | Sequential non-overlapping 7-day epochs.                                                                                                                            |
| Claim semantics                                | **FROZEN**      | Recipient-only USDC pull claim; no arbitrary receiver.                                                                                                              |
| Contract events/privacy                        | **FROZEN**      | No semantic behavioural/verifier/provider fields.                                                                                                                   |
| External provider addresses                    | **PROVISIONAL** | Current values checked, but must be reverified immediately before deployment.                                                                                       |
| Aave reserve liquidity at deployment/demo time | **PROVISIONAL** | Mutable external condition; not architecture.                                                                                                                       |
| Production multisig/timelock deployment        | **PROVISIONAL** | Production requirement; not an MVP implementation blocker.                                                                                                          |
| Repository decision-log synchronization        | **PROVISIONAL** | Supplied repository snapshot reaches PL-013, while this review was instructed to preserve already-accepted PL-015/016. Synchronize the repository log before merge. |

**Milestone 3 Solidity implementation may begin after this freeze is written into the canonical specification. No contract-design blocker remains.**

The available decision-log snapshot already establishes the bounded-oracle, non-custodial automation and backend/contract authority boundaries that this document preserves.

---

## 2. Product Lead decisions

The design-freeze prompt establishes KEPT-PL-016 as the latest already-accepted decision. New decisions therefore begin at **KEPT-PL-017**.

### DECISION ID: KEPT-PL-017

**Date:** 08-Sep-2026
**Title:** Vault, strategy binding and emergency pause semantics
**Status:** ACCEPTED
**Decision:** KeptSavingsVault retains the standard ERC-4626 deposit, mint, withdraw and redeem paths. The vault is deployed before the strategy, the AaveUSDCStrategy is deployed with the vault as its immutable sole asset-moving caller, and the vault then binds that strategy exactly once before accepting deposits. The strategy address cannot subsequently be changed. Kept-level pausing blocks new deposits and mints but never blocks withdraw or redeem.
**Reason:** This avoids CREATE2/predicted-address deployment complexity while still giving the final deployment a permanently bound strategy. Preserving withdrawal during Kept pause enforces the requirement that saver principal not be trapped by an operational control.
**Alternatives:** Constructor-time cyclic deployment; runtime-switchable strategy; globally paused ERC-4626; disabled mint/redeem functions.
**Affected teams:** Contracts, Security, Wallet/Intents, QA.
**Implementation consequence:** Vault has one write-once strategy binding operation; strategy has immutable vault authority; deposit paths require the strategy to be bound; withdrawal remains available during Kept pause.
**Context file to update:** `docs/specs/MVP Contract & Reward Specification.md`; Product Lead Decision Log.

### DECISION ID: KEPT-PL-018

**Date:** 08-Sep-2026
**Title:** RewardController roles and weekly epoch model
**Status:** ACCEPTED
**Decision:** RewardController uses OpenZeppelin AccessControl with separate qualification, epoch-configuration and pause roles. Reward epochs are sequential, non-overlapping seven-day periods opened by the epoch manager. Epoch configuration is immutable once opened. Reward USDC must already be available before an epoch opens. Anyone may add reward USDC; no role can withdraw reward USDC or rescue arbitrary tokens in the MVP.
**Reason:** Separate roles preserve bounded authority while seven-day epochs align directly with the three weekly MVP commitment paths and eliminate unnecessary annualized/epoch-duration arithmetic. A no-withdraw reward treasury provides the simplest solvency guarantee for the small MVP budget.
**Alternatives:** Ownable-only RewardController; 28-day reward epochs; mutable active epochs; treasury withdrawal/recovery authority; role-gated funding.
**Affected teams:** Contracts, Backend, Security, Economics, QA.
**Implementation consequence:** One current reward epoch at a time; fixed seven-day duration; pre-funding check at epoch creation; no treasury recovery function.
**Context file to update:** `docs/specs/MVP Contract & Reward Specification.md`; Product Lead Decision Log; reward economics spec.

### DECISION ID: KEPT-PL-019

**Date:** 08-Sep-2026
**Title:** Qualification registration and reward-claim semantics
**Status:** ACCEPTED
**Decision:** The onchain replay key is a non-semantic `bytes32 qualificationId`. Only qualified outcomes are submitted onchain; absence of a qualification record represents no onchain reward qualification. The qualification service supplies recipient, epoch, TWAB, confidence and reward weight but never a payout amount. Registrations are immutable and cannot be corrected/replaced. Rewards become discrete claimable entitlements. Only the pre-bound recipient may claim, with no arbitrary receiver argument and no partial claim. Claims do not expire in the MVP.
**Reason:** This minimizes public behavioural data and removes correction/clawback authority while keeping duplicate protection and payout destination deterministic.
**Alternatives:** Publish NOT\_QUALIFIED results; arbitrary receiver claims; backend payout amount; mutable qualification records; automatic push payouts.
**Affected teams:** Contracts, Backend, Privacy/Security, Product/UX, QA.
**Implementation consequence:** Qualification ID is both the opaque result identifier and replay key. Claim destination is fixed at registration.
**Context file to update:** `docs/specs/MVP Contract & Reward Specification.md`; Product Lead Decision Log; backend contract-facing specification.

### DECISION ID: KEPT-PL-020

**Date:** 08-Sep-2026
**Title:** MVP reward precision, hard ceilings and demo parameters
**Status:** ACCEPTED
**Decision:** USDC uses native 6-decimal units; period rate uses parts-per-million with denominator 1,000,000; confidence and reward weight use basis points with denominator 10,000. All reward arithmetic rounds down. Deployment-wide immutable ceilings are: 1,000 USDC eligible balance, 1,000 ppm seven-day period rate, 0.50 USDC per qualification, 1.00 USDC per user per epoch, and 10 USDC total allocation per epoch. Initial demo configuration is: 25 USDC controller prefunding, four sequential seven-day demo epochs, 6.25 USDC epoch budget, 500 USDC eligible-balance cap, 384 ppm period rate, 0.25 USDC qualification cap, and 0.75 USDC user cap.
**Reason:** These figures make oracle compromise economically small, support the intended demo comfortably, and encode the previously proposed approximately 2% annualized-equivalent behavioural rate as a direct weekly rate rather than putting annualization into contract logic.
**Alternatives:** 28-day settlement epoch; larger limits; bps rate precision; arbitrary backend payout; annualized onchain rate calculation.
**Affected teams:** Contracts, Backend, Economics, Product/UX, Security, QA.
**Implementation consequence:** Constants and epoch validation are deterministic; no product/economic constant remains for Hermes to invent.
**Context file to update:** `docs/specs/MVP Contract & Reward Specification.md`; Product Lead Decision Log; reward economics spec.

---

## 3. Final deployed contract graph

```text
KeptSavingsVault
        ↓
AaveUSDCStrategy

RewardController

```

`IYieldStrategy` is an interface, not a deployed fourth product contract.

### KeptSavingsVault

**Purpose:** ERC-4626 saver accounting and access to the single bound yield strategy.

**Assets it can hold:**

- canonical Monad USDC temporarily/incidentally;
- no behavioural reward treasury.

**Authority it has:**

- pull USDC from depositors through standard ERC-4626 flows;
- transfer deposited USDC to the bound strategy;
- request strategy withdrawals;
- mint/burn its own ERC-4626 shares;
- crystallize bounded positive-yield fees before share-changing operations.

**Authority it does not have:**

- no RewardController funds;
- no verifier/social information;
- no arbitrary admin seizure;
- no strategy switching after initial bind;
- no ability to transfer another user's shares except normal ERC-20/ERC-4626 allowance semantics.

**Immutable dependencies:**

- canonical USDC/ERC-4626 asset.

**Admin/role dependencies:**

- Ownable/Ownable2Step-style owner for one-time strategy bind and pause/unpause only.

**Pausable:** yes, for inflows.

**Can pause trap saver principal:** **No.** Withdraw/redeem are never disabled by the Kept pause.

### AaveUSDCStrategy

**Purpose:** Hold the vault's Aave USDC supply position and convert between canonical USDC and Aave aUSDC exposure.

**Assets it can hold:**

- canonical Monad USDC;
- Aave USDC aTokens.

**Authority it has:**

- supply its USDC to the immutable Aave Pool;
- withdraw its own Aave position;
- return underlying USDC only to the immutable vault.

**Authority it does not have:**

- cannot send saver assets to arbitrary users;
- cannot change vault;
- cannot change Pool;
- cannot change asset;
- cannot rescue principal/aTokens;
- no admin transfer function.

**Immutable dependencies:**

- vault;
- canonical USDC;
- Aave Pool;
- USDC aToken.

**Admin/role dependencies:** none after deployment.

**Pausable:** no Kept-specific pause.

**Can pause trap saver principal:** no Kept strategy pause exists. External Aave reserve/pool conditions can still limit withdrawal.

### RewardController

**Purpose:** Hold separate behavioural-reward USDC, open bounded reward epochs, accept bounded qualification inputs, calculate entitlements and settle claims.

**Assets it can hold:**

- native Monad USDC reward treasury.

Other accidentally transferred assets may become stranded because the MVP exposes no rescue mechanism.

**Authority it has:**

- accept reward funding;
- configure bounded epochs;
- accept qualifications from authorized qualifier;
- calculate rewards;
- pay recorded recipients.

**Authority it does not have:**

- no vault call authority;
- no vault-share authority;
- no saver principal authority;
- no strategy authority;
- no arbitrary recipient selection at claim time;
- no arbitrary USDC treasury withdrawal;
- no user-wallet signing authority.

**Immutable dependencies:**

- native Monad USDC reward asset.

**Admin/role dependencies:**

- `DEFAULT_ADMIN_ROLE`;
- `QUALIFIER_ROLE`;
- `EPOCH_MANAGER_ROLE`;
- `PAUSER_ROLE`.

**Pausable:** yes.

**Can pause trap saver principal:** **No.** RewardController is financially isolated from the vault.

---

## 4. `IYieldStrategy` frozen interface

Frozen semantic interface:

```text
asset() -> address

deposit(uint256 assets) -> uint256 deposited

withdraw(uint256 assets) -> uint256 withdrawn

totalAssets() -> uint256

availableLiquidity() -> uint256

```

### `asset()`

Returns the canonical underlying token.

For the MVP it must equal the vault's ERC-4626 asset.

No state change.

### `deposit(uint256 assets)`

Caller: **vault only**.

Precondition:

- `assets > 0`;
- strategy already holds at least `assets` underlying, transferred by the vault.

Behavior:

- supplies exactly `assets` to Aave;
- Aave position remains owned by the strategy;
- returns exactly the amount successfully supplied.

Failure:

- revert atomically if Aave supply fails or exact supply cannot be established.

The strategy does not `transferFrom` arbitrary users.

### `withdraw(uint256 assets)`

Caller: **vault only**.

No receiver argument exists.

Behavior:

- obtains exactly `assets` underlying from idle strategy USDC and/or Aave;
- sends exactly `assets` to the permanently authorized vault;
- returns the exact amount withdrawn.

Failure:

- if exact assets cannot be returned, revert;
- no partial-success API.

This is intentionally safer than `withdraw(assets, receiver)` because the strategy cannot be directed to transfer saver assets to an attacker-controlled address.

### `totalAssets()`

Returns:

```text
idle USDC held by strategy
+
current underlying-equivalent aUSDC balance

```

Aave aToken balances incorporate accrued supply interest.

### `availableLiquidity()`

Retained.

Returns an advisory maximum of underlying that the strategy can currently return without exceeding its own position or Aave reserve cash, plus any idle strategy USDC.

Conceptually:

```text
idleUSDC
+
min(
    aTokenBalanceOfStrategy,
    underlyingUSDCBalanceAtAToken
)

```

Aave's own vault implementation uses the reserve's underlying balance at the aToken as its available-liquidity check.

This is advisory. A concurrent Aave liquidity change may still make a subsequent withdrawal revert.

### Allowance behavior

The strategy grants the immutable Aave Pool a maximum USDC allowance once during deployment using a safe/force-approve pattern.

There is:

- no external allowance-management method;
- no arbitrary spender;
- no vault-to-strategy approval requirement because the vault transfers USDC directly to the strategy.

### Permanent caller binding

`AaveUSDCStrategy.vault` is immutable.

Only that vault may call `deposit` and `withdraw`.

There is no upgrade hook, strategy setter or caller-management function.

---

## 5. `AaveUSDCStrategy` freeze

### Constructor / immutable dependencies

Constructor receives:

```text
vault
asset
aavePool
aToken

```

All are non-zero and immutable.

Constructor validation must establish:

```text
aToken.UNDERLYING_ASSET_ADDRESS() == asset

```

where supported by the pinned Aave interface.

### Canonical asset assumption

Only canonical Circle native Monad USDC is supported.

No bridged-USDC alias or generic stablecoin mode exists.

### Aave Pool dependency

The Pool is permanently fixed for the strategy deployment.

There is no PoolAddressesProvider-driven runtime migration.

A future Aave deployment/migration requires a new Kept vault/strategy deployment or a later explicitly designed migration mechanism.

### aToken accounting

`totalAssets()` includes:

- strategy's idle USDC;
- `aToken.balanceOf(address(this))`.

The aToken is saver principal plus accrued underlying yield and must never be treated as a rescuable miscellaneous token.

### Deposit/supply behavior

1. Vault transfers exact USDC to strategy.
2. Vault calls `deposit(assets)`.
3. Strategy calls Aave Pool `supply(asset, assets, address(this), 0)`.
4. If supply fails, the whole vault deposit transaction reverts.

No principal remains intentionally idle after a normal successful deposit.

### Withdrawal behavior

1. Strategy uses idle USDC first if any.
2. For the shortfall, strategy calls Aave Pool `withdraw`.
3. Underlying is returned to the vault.
4. Strategy verifies the requested amount was made available.
5. Any failure reverts atomically.

Aave supports withdrawing underlying to a specified destination and returns the amount withdrawn.

### Liquidity shortfall

Aave withdrawals depend on available unborrowed reserve liquidity.

If exact requested liquidity is unavailable:

- the strategy does not silently haircut;
- the transaction reverts;
- the vault surfaces an insufficient-strategy-liquidity failure;
- `maxWithdraw`/`maxRedeem` should use `availableLiquidity()` to reduce avoidable failures.

This external liquidity limit is not presented as a Kept withdrawal lock.

### Approval policy

At strategy construction:

- approve only immutable Aave Pool;
- allowance is maximum;
- no mutable approval-management function.

### Rescue/recovery

**No rescue function in MVP.**

No admin can recover:

- canonical USDC;
- aUSDC;
- any other token.

The cost is that accidental unrelated token transfers can become stranded. That is preferable to creating a generic asset-transfer authority in the MVP.

### Pause behavior

No strategy-specific Kept pause.

New strategy supplies stop automatically when vault deposits are paused.

Vault withdrawals remain allowed and may call the strategy.

### `CURRENT EXTERNAL CONFIG — VERIFY BEFORE DEPLOYMENT`

Current Aave address-book data observed during this review lists Monad Pool `0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef`, chain ID `143`, canonical USDC `0x754704Bc059F8C67012fEd69BC8A327a5aafb603`, six USDC decimals, and USDC aToken `0x35a73BAcb179d3740395A3ceCc87FF2e581d6042`.

These are deployment configuration, **not Product Lead architectural decisions**. Reverify from the Aave address book before fork configuration and again before deployment.

---

## 6. `KeptSavingsVault` frozen interface

### ERC-4626 path

Standard ERC-4626 behavior is retained.

#### `deposit(uint256 assets, address receiver)`

**KEEP.**

Manual/user-authorized path.

Receiver remains a standard ERC-4626 receiver and may differ from caller.

The user must explicitly authorize this transaction, including its receiver.

#### `mint(uint256 shares, address receiver)`

**KEEP.**

No concrete MVP security or product reason justifies intentionally breaking standard ERC-4626 behavior.

#### `withdraw(uint256 assets, address receiver, address owner)`

**KEEP.**

Standard ERC-4626 allowance/owner semantics.

Not blocked by Kept pause.

#### `redeem(uint256 shares, address receiver, address owner)`

**KEEP.**

Not blocked by Kept pause.

Disabling standard ERC-4626 functions is rejected for MVP.

### Historical delegated automatic-saving path — superseded

> **Not current scope:** KEPT-PL-023 removes the entry point, cadence state, scheduler and delegated authorization described in this historical section. `depositAutomatically(uint256)` must remain unavailable in the MVP.

Frozen entry point:

```text
depositAutomatically(uint256 assets)

```

No receiver argument.

#### Caller

Any address may technically call the function, but the intended caller is the user's own Privy Monad wallet operating through its narrowly scoped delegated signer.

The vault itself does not distinguish which key signed for the wallet.

#### Share recipient

Always:

```text
receiver = msg.sender

```

The function cannot credit shares to another account.

#### Asset transfer

Uses the same canonical USDC and ERC-4626 deposit accounting as a standard deposit.

USDC is pulled from `msg.sender` using the allowance previously established by the user-owned account.

The function does not contain an arbitrary token/spender/receiver parameter.

#### Cadence state key

```text
lastAutomaticDepositAt[msg.sender]

```

The key is the actual wallet/account address.

#### Exact seven-day meaning

```text
7 days = 604,800 seconds

```

Rolling interval, not calendar-week semantics.

A new automatic deposit is permitted iff:

```text
lastAutomaticDepositAt[msg.sender] == 0
OR
block.timestamp >= lastAutomaticDepositAt[msg.sender] + 604800

```

#### First call

Immediately allowed.

#### State update and failed calls

`lastAutomaticDepositAt` is updated only after the deposit has fully succeeded.

If:

- USDC transfer fails;
- ERC-4626 accounting fails;
- strategy transfer/supply fails;
- any later operation reverts;

then the whole transaction reverts and cadence state remains unchanged.

#### Interaction with standard `deposit`

Manual `deposit` does **not** update or reset automatic-saving cadence.

#### Interaction with withdrawal

Withdrawals do **not** update or reset automatic-saving cadence.

#### Effect of automatic deposits on withdrawals

None.

Shares minted through `depositAutomatically` are ordinary ERC-4626 shares and remain withdrawable/redeemable like any others.

This preserves the Product Outline's requirement that funds remain under user control.

### Strategy binding

Vault constructor does **not** require the strategy address.

Deployment sequence:

```text
1. deploy KeptSavingsVault(asset, owner, feeRecipient, annualFeeCapBps, profitFeeCapBps)
2. deploy AaveUSDCStrategy(vault, asset, pool, aToken)
3. owner calls vault.bindStrategy(strategy)
4. vault validates matching asset
5. binding becomes permanent
6. deposits may begin

```

`bindStrategy`:

- owner only;
- exactly once;
- requires strategy != zero;
- requires strategy asset == vault asset;
- requires `totalSupply() == 0`;
- after success there is no strategy setter.

The strategy address is therefore **write-once permanent**, not a Solidity `immutable` variable.

### Immediate strategy deployment

Every successful standard deposit or mint immediately deploys the newly received USDC into the strategy in the same transaction.

If strategy deployment fails, the deposit/mint operation reverts.

Direct accidental token transfers to the vault are not automatically swept; idle canonical USDC remains included in `totalAssets()`.

### `totalAssets()`

```text
vault idle canonical USDC
+
strategy.totalAssets()

```

### Insufficient Aave liquidity

Withdrawal uses vault idle USDC first, then asks the strategy for the exact shortfall.

If the exact requested amount cannot be obtained from the strategy, the withdrawal/redeem reverts.

`maxWithdraw()` and `maxRedeem()` should be constrained by current liquid assets, but cannot guarantee future Aave liquidity between quote and execution.

### Pausing

**Deposits:** paused.

**Mint:** paused.

**Automatic deposits:** paused.

**Withdrawals:** never paused by Kept.

**Redeems:** never paused by Kept.

**Strategy supply:** indirectly paused because no new vault deposits/mints can supply.

**Strategy withdrawal:** remains operational.

**Emergency condition may block user withdrawals:** Kept's own pause may not. An external Aave liquidity/reserve failure may still make a requested withdrawal technically impossible.

---

## 7. `RewardController` frozen authority model

### Access-control model

Use OpenZeppelin `AccessControl`.

No proxy and no upgradeability.

Roles:

```text
DEFAULT_ADMIN_ROLE
QUALIFIER_ROLE
EPOCH_MANAGER_ROLE
PAUSER_ROLE

```

### MVP deployment ownership

For the hackathon MVP:

- a securely held Product Lead/deployment EOA may hold `DEFAULT_ADMIN_ROLE`;
- epoch manager and pauser may initially be the same controlled admin EOA;
- `QUALIFIER_ROLE` must be a separate backend/oracle authorization key.

A multisig is **not required to begin the hackathon MVP**.

Before production use with meaningful third-party funds, privileged administrative roles should move to a multisig or equivalent reviewed operational-control arrangement.

### Access-control matrix

| CapabilityPublicQualifierEpoch ManagerPauserDefault Admin |                |                |                |                |                            |
| --------------------------------------------------------- | -------------- | -------------- | -------------- | -------------- | -------------------------- |
| Add reward USDC                                           | Yes            | Yes            | Yes            | Yes            | Yes                        |
| Open epoch                                                | No             | No             | Yes            | No             | Only if separately granted |
| Submit qualification                                      | No             | Yes            | No             | No             | Only if separately granted |
| Claim own reward                                          | Recipient only | Recipient only | Recipient only | Recipient only | Recipient only             |
| Pause/unpause RewardController                            | No             | No             | No             | Yes            | Only if separately granted |
| Grant/revoke roles                                        | No             | No             | No             | No             | Yes                        |
| Transfer reward treasury arbitrarily                      | No             | No             | No             | No             | No                         |
| Access vault assets/shares                                | No             | No             | No             | No             | No                         |
| Access strategy assets                                    | No             | No             | No             | No             | No                         |
| Change hard ceilings                                      | No             | No             | No             | No             | No                         |
| Upgrade contract                                          | No             | No             | No             | No             | No                         |

### Funding

Anyone may:

- transfer canonical USDC directly to RewardController;
- call a convenience `fundRewards(uint256 assets)` function after approval.

Funding authority is unrestricted because adding reward capital does not create authority over it.

### Recovery

No token-recovery function exists in MVP.

Therefore no role can recover:

- reward USDC;
- vault shares;
- aTokens;
- accidental unrelated ERC-20s.

### Financial isolation

RewardController has no reference or callable authority required over:

- KeptSavingsVault;
- AaveUSDCStrategy;
- user wallet signing;
- user share balances.

The accepted architecture already requires reward authority to be independent of saver principal.

### Reward pause

Pause blocks:

- new qualification registration;
- reward claims;
- opening a new epoch.

Funding remains possible.

Pause has no effect whatsoever on KeptSavingsVault withdrawals.

---

## 8. Qualification submission

### Qualification identifier

```text
bytes32 qualificationId

```

Requirements:

- non-zero;
- opaque/non-semantic;
- unique per qualifying commitment-period result;
- high entropy or otherwise non-dictionary-reversible;
- not a direct hash of a low-entropy public commitment type.

It is also the replay identifier.

### Recipient

```text
address recipient

```

Must be non-zero.

This address becomes the permanent payout destination for that qualification.

### Epoch identifier

```text
uint64 epochId

```

Must refer to the currently open reward epoch.

### Binary qualification

Binary qualification is represented by **registration presence**:

```text
registered qualification = QUALIFIED
no registered qualification = no onchain qualified reward result

```

`NOT_QUALIFIED` is not submitted to Monad in the MVP.

This reduces public behavioural state and remains consistent with the minimum-disclosure architecture.

### Confidence

```text
uint16 confidenceBps

```

Range:

```text
1 ... 10,000

```

10,000 = 1.0.

Values above 10,000 revert.

Zero-value confidence is not a useful qualified result and is rejected.

### Reward weight

```text
uint16 rewardWeightBps

```

Range:

```text
1 ... 10,000

```

10,000 = 1.0.

Values above 10,000 revert.

### Time-weighted eligible balance

```text
uint256 twabAssets

```

Raw canonical-USDC units.

The contract **does not derive TWAB independently**.

Reason: doing so would require new historical balance/checkpoint infrastructure and significantly broaden the vault's responsibility.

Backend/indexer produces TWAB from authoritative onchain financial activity and submits it as a bounded qualification input.

Contract enforcement:

```text
require(twabAssets <= MAX_ELIGIBLE_BALANCE)

cappedEligible =
    min(twabAssets, epoch.eligibleBalanceCap)

```

A compromised qualifier can therefore overstate TWAB only up to the immutable hard ceiling and active epoch lower cap.

### Submission semantic interface

Conceptually:

```text
registerQualification(
    bytes32 qualificationId,
    address recipient,
    uint64 epochId,
    uint256 twabAssets,
    uint16 confidenceBps,
    uint16 rewardWeightBps
) -> uint256 rewardAmount

```

Caller:

- `QUALIFIER_ROLE` only.

### Expiry/deadline

No separate deadline parameter.

Qualification registration is valid only while:

```text
epoch.startAt <= block.timestamp < epoch.endAt

```

After epoch end, new qualifications for that epoch are rejected.

### Correction/replacement

Not supported.

A registered `qualificationId` is immutable.

No:

- overwrite;
- correction;
- cancellation;
- clawback;
- replacement.

Operational errors must be prevented before submission.

### Duplicate behavior

A second registration using an existing `qualificationId` reverts.

The ID is not marked consumed if the original transaction reverted.

---

## 9. Reward formula freeze

### Fixed-point representations

**USDC amounts:** raw 6-decimal USDC units.

Example:

```text
1 USDC = 1,000,000 units

```

**Period rate:** parts per million.

```text
RATE_DENOMINATOR = 1,000,000

```

**Confidence:** basis points.

```text
BPS_DENOMINATOR = 10,000

```

**Reward weight:** basis points.

```text
BPS_DENOMINATOR = 10,000

```

### Period handling

Contract stores the **direct seven-day reward-period rate**.

It does not:

- store an APY;
- calculate annualization;
- multiply by epoch duration;
- use seconds in reward arithmetic.

Epoch duration is already fixed to seven days.

Any annualized-equivalent display is an offchain UX calculation, not contract economics.

### Completion score

Removed from MVP contract math.

Qualification is binary:

```text
not qualified -> no submission/no reward
qualified     -> completion factor = 1

```

### Streaks

No streak multiplier or streak input appears in MVP contract reward math.

The Product Outline describes streak modifiers as a possible broader model rather than a requirement of the frozen MVP arithmetic.

### Exact arithmetic

Pseudocode:

```text
eligibleAssets =
    min(twabAssets, epoch.eligibleBalanceCap)

baseReward =
    floor(
        eligibleAssets
        * epoch.periodRatePpm
        / 1,000,000
    )

confidenceAdjusted =
    floor(
        baseReward
        * confidenceBps
        / 10,000
    )

weightedReward =
    floor(
        confidenceAdjusted
        * rewardWeightBps
        / 10,000
    )

qualificationLimited =
    min(
        weightedReward,
        epoch.qualificationCap,
        MAX_REWARD_PER_QUALIFICATION
    )

remainingUserCap =
    epoch.userCap
    - userAllocated[epochId][recipient]

remainingEpochBudget =
    epoch.budget
    - epoch.allocated

reward =
    min(
        qualificationLimited,
        remainingUserCap,
        remainingEpochBudget
    )

```

Requirements:

```text
reward > 0

rewardToken.balanceOf(controller)
>= totalOutstandingClaimable + reward

```

Then atomically:

```text
epoch.allocated += reward

userAllocated[epochId][recipient] += reward

totalOutstandingClaimable += reward

qualification[qualificationId] =
    { recipient, epochId, reward, claimed=false }

```

### Rounding

All intermediate reward calculations round **down**.

Use overflow-safe multiplication/division such as OpenZeppelin `Math.mulDiv`.

Rounding down protects treasury solvency and avoids granting fractions above the configured formula.

---

## 10. Reward hard ceilings and initial demo epoch values

### A. Immutable deployment-wide hard ceilings

| LimitFrozen value                                     |                                     |
| ----------------------------------------------------- | ----------------------------------- |
| Maximum eligible balance per qualification/user input | **1,000 USDC**                      |
| Maximum seven-day period reward rate                  | **1,000 ppm = 0.10% per period**    |
| Maximum confidence                                    | **10,000 bps = 1.0**                |
| Maximum reward weight                                 | **10,000 bps = 1.0**                |
| Maximum reward per qualification                      | **0.50 USDC**                       |
| Maximum reward per user per epoch                     | **1.00 USDC**                       |
| Maximum total rewards per epoch                       | **10.00 USDC**                      |
| Epoch duration                                        | **7 days / 604,800 seconds, fixed** |

The maximum 1,000 ppm weekly period rate is intentionally well above the initial demo rate while still economically small. At the immutable eligible-balance ceiling, the raw full-confidence/full-weight amount is 1 USDC before the 0.50 USDC qualification ceiling.

That gives a compromised qualifier a maximum effect of:

- 0.50 USDC per qualification;
- 1.00 USDC to any one user in one epoch;
- 10 USDC across the entire epoch.

### B. Initial demo configuration

| ParameterProposed earlierDecisionFrozen demo value |                          |                                 |                                                                                  |
| -------------------------------------------------- | ------------------------ | ------------------------------- | -------------------------------------------------------------------------------- |
| Reward treasury                                    | 25 USDC / 28 days        | **MODIFY**                      | **25 USDC initial controller prefunding, backing four sequential weekly epochs** |
| Epoch duration                                     | 28-day treasury context  | **MODIFY**                      | **7 days**                                                                       |
| Per-epoch budget / total epoch cap                 | not separately fixed     | **MODIFY**                      | **6.25 USDC**                                                                    |
| Eligible-balance cap                               | 500 USDC                 | **ACCEPT**                      | **500 USDC**                                                                     |
| Behavioural rate                                   | 2% annualized-equivalent | **ACCEPT WITH ENCODING CHANGE** | **384 ppm per seven-day period**                                                 |
| Per-user cap                                       | 0.75 USDC                | **ACCEPT**                      | **0.75 USDC per seven-day epoch**                                                |
| Per-qualification cap                              | not previously fixed     | **MODIFY**                      | **0.25 USDC**                                                                    |

### Rate rationale

A 2% simple annualized-equivalent rate converted to seven days is approximately:

```text
0.02 × 7 / 365
= 0.00038356

```

The nearest ppm configuration is:

```text
384 / 1,000,000
= 0.000384
= 0.0384% per seven days

```

Its simple annualized equivalent is approximately 2.00%.

At the demo eligible-balance cap:

```text
500 USDC × 384 ppm
= 0.192 USDC

```

before confidence and reward-weight reductions.

That remains below the 0.25 USDC per-qualification cap.

The annualized equivalent is explanatory only and must not be stored or derived by RewardController.

---

## 11. Epoch model

### Duration

Exactly:

```text
7 days = 604,800 seconds

```

Not configurable.

### Epoch ID

```text
uint64

```

Sequential internal counter beginning at `1`.

The epoch manager does not choose arbitrary semantic IDs.

### Opening an epoch

Conceptual function:

```text
openEpoch(
    uint32 periodRatePpm,
    uint256 eligibleBalanceCap,
    uint256 qualificationCap,
    uint256 userCap,
    uint256 budget
) -> uint64 epochId

```

`EPOCH_MANAGER_ROLE` only.

### Start/end

On successful open:

```text
startAt = block.timestamp
endAt   = startAt + 7 days

```

### Overlap

Not allowed.

A new epoch can open only if:

- no epoch has yet existed; or
- `block.timestamp >= previousEpoch.endAt`.

### Configuration mutation

Epoch configuration is immutable after opening.

No active-epoch editing.

No future scheduled epochs are necessary in MVP.

### Hard-ceiling validation

At open:

```text
periodRatePpm       <= MAX_PERIOD_RATE_PPM
eligibleBalanceCap <= MAX_ELIGIBLE_BALANCE
qualificationCap   <= MAX_REWARD_PER_QUALIFICATION
userCap            <= MAX_REWARD_PER_USER_PER_EPOCH
budget             <= MAX_TOTAL_REWARDS_PER_EPOCH
qualificationCap   <= userCap
userCap            <= budget

```

All values must be non-zero.

### Funding requirement

Before opening:

```text
availableUnallocatedUSDC =
    rewardToken.balanceOf(controller)
    - totalOutstandingClaimable

```

Require:

```text
availableUnallocatedUSDC >= epoch.budget

```

Because RewardController exposes no treasury-withdrawal function and epochs do not overlap, this is sufficient to preserve prefunding.

Qualification registration re-checks solvency before creating each entitlement.

### Insufficient funding

`openEpoch` reverts.

An epoch may not start underfunded.

### Unused reward budget

Unused physical USDC remains in RewardController.

It is not assigned automatically to a historical user or withdrawn by an admin.

It may support the next epoch after the previous epoch ends.

### Claims after epoch end

Existing claimable entitlements remain claimable indefinitely.

### Claim expiry

None in MVP.

### Cron/onchain automation

None.

Opening a new epoch is an explicit `EPOCH_MANAGER_ROLE` transaction.

---

## 12. Claim model

### Payout model

**User-pull.**

Qualification creates an entitlement.

It does not immediately transfer reward USDC.

### Frozen function

Conceptually:

```text
claim(bytes32 qualificationId)

```

### Destination

Always the `recipient` recorded when the qualification was registered.

### Caller

Only:

```text
msg.sender == qualification.recipient

```

### Arbitrary receiver

Not permitted.

No `receiver` argument.

### Reward asset

Canonical native Monad USDC.

### Duplicate claim

Reverts.

### Partial claims

Not supported.

Each qualification is either:

- completely unclaimed;
- completely claimed.

### Claim timing

Claim is available immediately after qualification registration unless RewardController itself is paused.

It remains available after epoch end.

### Accounting

Before transfer:

- mark qualification claimed;
- subtract entitlement from `totalOutstandingClaimable`.

Then transfer exact reward USDC to recipient.

A transfer failure reverts the whole claim, restoring state atomically.

---

## 13. Events

### KeptSavingsVault events

#### ERC-4626 `Deposit`

Inherited standard event.

Indexed:

- sender;
- owner/receiver according to ERC-4626 standard.

Non-indexed:

- assets;
- shares.

Privacy rationale:
Financial deposit activity is inherently part of the public vault transaction and required by ERC-4626 tooling.

#### ERC-4626 `Withdraw`

Inherited standard event.

Indexed standard ERC-4626 account fields.

Non-indexed:

- assets;
- shares.

Privacy rationale:
Required financial settlement state.

#### `StrategyBound`

```text
StrategyBound(address indexed strategy)

```

Privacy rationale:
Pure deployment/configuration information.

#### `AutomaticDeposit`

```text
AutomaticDeposit(
    address indexed account,
    uint256 assets,
    uint256 shares,
    uint64 nextEligibleAt
)

```

Privacy rationale:
No semantic behavioural commitment is disclosed. Use of the automation selector is already inferable from public calldata; the event is retained for explicit QA/demo evidence and indexing.

#### `Paused` / `Unpaused`

Use OpenZeppelin standard events.

### AaveUSDCStrategy events

#### `StrategyDeposit`

```text
StrategyDeposit(uint256 assets)

```

No indexed user field.

Privacy rationale:
Only aggregate financial strategy movement.

#### `StrategyWithdrawal`

```text
StrategyWithdrawal(uint256 assets)

```

No indexed user field.

Privacy rationale:
Only aggregate financial strategy movement.

### RewardController events

#### `RewardsFunded`

```text
RewardsFunded(
    address indexed funder,
    uint256 amount
)

```

No behavioural information.

#### `EpochOpened`

```text
EpochOpened(
    uint64 indexed epochId,
    uint64 startAt,
    uint64 endAt,
    uint32 periodRatePpm,
    uint256 eligibleBalanceCap,
    uint256 qualificationCap,
    uint256 userCap,
    uint256 budget
)

```

Economic configuration is intentionally public and auditable.

#### `QualificationRegistered`

```text
QualificationRegistered(
    bytes32 indexed qualificationId,
    address indexed recipient,
    uint64 indexed epochId,
    uint256 rewardAmount
)

```

Do **not** emit:

- behavioural type;
- verification class;
- provider;
- verifier identities;
- social edges;
- raw evidence;
- commitment wording;
- confidence;
- reward-weight input;
- TWAB input.

Those inputs are transaction calldata and may remain observable to a sophisticated observer, but the event/indexing surface does not deliberately amplify them. Future privacy improvements may require stronger mechanisms.

#### `RewardClaimed`

```text
RewardClaimed(
    bytes32 indexed qualificationId,
    address indexed recipient,
    uint256 amount
)

```

Only financially necessary settlement state.

#### `Paused` / `Unpaused`

OpenZeppelin standard events.

#### AccessControl events

Use OpenZeppelin:

- `RoleGranted`;
- `RoleRevoked`;
- `RoleAdminChanged` where applicable.

No custom duplicate role-event layer.

---

## 14. Custom errors

Expected categories/names may be implemented with equivalent naming, but semantics are frozen.

### Vault

```text
StrategyNotBound()
StrategyAlreadyBound()
InvalidStrategy()
StrategyAssetMismatch()
AutomaticDepositTooSoon(uint64 nextEligibleAt)
InsufficientStrategyLiquidity(uint256 requested, uint256 available)
ZeroAssets()

```

Pause may use OpenZeppelin's standard pausable error.

### Strategy

```text
UnauthorizedVaultCaller(address caller)
InvalidAsset()
InvalidAavePool()
InvalidAToken()
ATokenAssetMismatch()
InsufficientAaveLiquidity(uint256 requested, uint256 available)
UnexpectedWithdrawAmount(uint256 requested, uint256 received)

```

### RewardController

```text
InvalidQualificationId()
InvalidRecipient()
QualificationAlreadyRegistered(bytes32 qualificationId)
EpochNotActive(uint64 epochId)
NoActiveEpoch()
PreviousEpochStillActive(uint64 epochId)
QualificationInputExceedsHardCeiling()
InvalidConfidence()
InvalidRewardWeight()
HardCeilingExceeded()
EpochBudgetExhausted()
UserCapExhausted()
ZeroReward()
InsufficientRewardFunding(uint256 required, uint256 available)
AlreadyClaimed(bytes32 qualificationId)
NotQualificationRecipient(address caller)
InvalidEpochConfiguration()

```

Unauthorized role operations may use OpenZeppelin AccessControl errors.

Paused operations may use OpenZeppelin Pausable errors.

### Cap semantics

A raw qualification input that violates an immutable input ceiling reverts.

Lower economic output caps are applied through `min(...)`.

If the remaining user/epoch allowance is zero, registration reverts with the appropriate exhaustion error.

---

## 15. State/storage inventory

Strict rule applied: no field exists merely for future flexibility.

### KeptSavingsVault

| StateClassificationWhy                  |                                         |                                                             |
| --------------------------------------- | --------------------------------------- | ----------------------------------------------------------- |
| ERC-4626 underlying `asset`             | immutable                               | Canonical saver asset.                                      |
| `strategy` address                      | mutable operational, write-once         | Permanently binds one strategy after deployment sequencing. |
| `lastAutomaticDepositAt[address]`       | mutable authorization/operational state | Enforces rolling seven-day cadence.                         |
| owner                                   | mutable authorization state             | One-time strategy bind and pause authority.                 |
| paused flag                             | mutable operational state               | Stops new capital inflow in emergency.                      |
| ERC-20 share balances/supply/allowances | mutable financial state                 | Standard ERC-20/ERC-4626 saver accounting.                  |

No:

- reward state;
- commitment IDs;
- verifier data;
- strategy list;
- migration state;
- reward-oracle state.

### AaveUSDCStrategy

| StateClassificationWhy |           |                                       |
| ---------------------- | --------- | ------------------------------------- |
| `vault`                | immutable | Sole asset-moving caller.             |
| `asset`                | immutable | Canonical USDC.                       |
| `aavePool`             | immutable | Single Aave deployment.               |
| `aToken`               | immutable | Position accounting/liquidity lookup. |

No mutable admin state.

No owner.

No pause flag.

No rescue recipient.

No strategy-switching state.

Aave ERC-20 allowance exists externally as token allowance, not as Kept-managed configuration.

### RewardController

| StateClassificationWhy            |                                     |                                             |
| --------------------------------- | ----------------------------------- | ------------------------------------------- |
| `rewardAsset`                     | immutable                           | Native Monad USDC.                          |
| hard-ceiling values               | constants/immutable                 | Bounds compromised privileged actors.       |
| `EPOCH_DURATION`                  | constant                            | Fixed 7-day model.                          |
| AccessControl roles               | mutable authorization state         | Separated operational duties.               |
| paused flag                       | mutable operational state           | Reward incident control.                    |
| `currentEpochId`                  | mutable operational/financial state | Sequential epoch identity.                  |
| `epochs[epochId]`                 | mutable financial state             | Frozen config plus allocated amount.        |
| `qualifications[qualificationId]` | mutable financial state             | Recipient, epoch, entitlement, claim state. |
| `userAllocated[epochId][user]`    | mutable financial state             | Enforces per-user epoch cap.                |
| `totalOutstandingClaimable`       | mutable financial state             | Prefunding/solvency accounting.             |

Qualification record need only store:

```text
recipient
epochId
rewardAmount
claimed

```

Do not persist:

- confidence;
- reward weight;
- TWAB;
- semantic commitment type;
- provider;
- verifier;
- evidence.

---

## 16. Security invariants

1. **RewardController cannot transfer vault principal or vault shares.**
2. **Qualification authority cannot choose an arbitrary reward amount.** It supplies only bounded inputs to fixed contract arithmetic.
3. **Qualification authority cannot bypass immutable hard ceilings.**
4. **Epoch configuration cannot exceed immutable hard ceilings.**
5. **Reward payout cannot exceed available pre-funded reward USDC.**
6. **No automation-specific savings entry point exists in the MVP.**
7. **A sponsored transaction cannot change the user-authorized asset, amount, vault or receiver.**
8. **Backend request state cannot authorize a transfer by itself.** Explicit user authorization remains required.
9. **Withdrawal of saver funds is independent of behavioural reward qualification.**
10. **RewardController pause cannot freeze saver principal.**
11. **Kept-level vault pause cannot disable withdraw/redeem.**
12. **Semantic commitment/verifier/provider/social data is not emitted or stored in RewardController.**
13. **Replay/duplicate qualification cannot create a second reward entitlement.**
14. **Duplicate claim cannot pay twice.**
15. **AaveUSDCStrategy cannot transfer saver assets to an arbitrary unauthorized recipient.**
16. **No Kept admin has a general-purpose saver-fund seizure path.**
17. **No Kept admin can switch the active yield strategy after initial binding.**
18. **A failed deposit cannot create shares or advance fee-accounting state.**
19. **No owner or backend path can transfer user assets without the user's ERC-20 authorization.**
20. **Reward epoch configuration is immutable after epoch opening.**
21. **A new reward epoch cannot overlap the preceding epoch.**
22. **Outstanding claim liabilities remain covered when a new epoch is opened.**
23. **RewardController has no admin treasury-withdraw function.**
24. **Aave aTokens cannot be rescued from the strategy by an administrator.**
25. **No behavioural reward arithmetic uses a streak or partial-completion score in MVP.**

---

## 17. Milestone 3 acceptance tests

### Vault / ERC-4626

| TestExpected result         |                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| First deposit               | Shares minted according to ERC-4626; USDC supplied to strategy.                             |
| Multiple deposits           | Accounting remains correct across exchange-rate changes.                                    |
| Multiple users              | Shares/assets remain proportionate and isolated.                                            |
| `deposit`                   | Standard ERC-4626 behavior retained.                                                        |
| `mint`                      | Standard ERC-4626 behavior retained.                                                        |
| Partial withdrawal          | Exact requested assets returned where liquid.                                               |
| Full withdrawal             | User can fully redeem position where Aave liquidity permits.                                |
| `redeem`                    | Standard ERC-4626 behavior retained.                                                        |
| Yield accrual               | `totalAssets` and share conversion reflect accrued aToken value.                            |
| Vault idle USDC             | Included in `totalAssets`.                                                                  |
| Direct donation             | Does not create exploitable first-depositor share extraction.                               |
| Inflation attack            | Seed/virtual-share behavior tested under adversarial donation patterns.                     |
| 6-decimal USDC              | Share/asset conversion correct.                                                             |
| Strategy not bound          | Deposit and mint reject.                                                                    |
| One-time bind               | Second strategy bind rejects.                                                               |
| Wrong strategy asset        | Bind rejects.                                                                               |
| Aave insufficient liquidity | `maxWithdraw/maxRedeem` lower where observable; excessive actual withdrawal reverts safely. |
| RewardController paused     | Vault withdrawal still succeeds.                                                            |
| Vault deposits paused       | `deposit` and `mint` reject.                                                                |
| Vault paused withdrawal     | `withdraw`/`redeem` remain available.                                                       |
| No admin seizure            | Owner cannot transfer arbitrary user principal.                                             |

### Savings authorization

| TestExpected result                              |                                                            |
| ------------------------------------------------ | ---------------------------------------------------------- |
| Automation-specific selector                     | Unavailable.                                               |
| Explicit user-authorized deposit                 | Executes with the authorized asset, amount and receiver.   |
| Sponsored transaction with altered receiver      | Rejected before signing or execution.                      |
| Sponsored transaction with altered amount/asset  | Rejected before signing or execution.                      |
| Failed transfer or strategy supply                | No shares or fee-accounting changes persist.               |

### AaveUSDCStrategy

| TestExpected result       |                                                          |
| ------------------------- | -------------------------------------------------------- |
| Non-vault deposit call    | Rejects.                                                 |
| Non-vault withdraw call   | Rejects.                                                 |
| Exact supply              | Aave receives assets; strategy receives aToken position. |
| Yield accrual             | `totalAssets()` increases appropriately.                 |
| Exact withdrawal          | USDC goes only to vault.                                 |
| Arbitrary receiver        | No interface exists.                                     |
| Partial reserve liquidity | `availableLiquidity()` reflects lower amount.            |
| Excessive withdraw        | Reverts safely.                                          |
| Approval                  | Only immutable Pool has configured allowance.            |
| Rescue principal          | No such function exists.                                 |
| Admin control             | No owner/admin role exists.                              |

### RewardController

| TestExpected result                 |                                                     |
| ----------------------------------- | --------------------------------------------------- |
| Public funding                      | Valid USDC funding succeeds.                        |
| Direct USDC transfer                | Increases available funding.                        |
| Open funded epoch                   | Succeeds.                                           |
| Open underfunded epoch              | Reverts.                                            |
| Epoch cap > hard max                | Reverts.                                            |
| Rate > hard max                     | Reverts.                                            |
| User cap > hard max                 | Reverts.                                            |
| Eligible cap > hard max             | Reverts.                                            |
| Qualification cap > hard max        | Reverts.                                            |
| Overlapping epoch                   | Reverts.                                            |
| Valid qualification                 | Computes expected entitlement.                      |
| Unauthorized qualification          | Rejects.                                            |
| Zero qualification ID               | Rejects.                                            |
| Duplicate qualification             | Rejects.                                            |
| Replay same ID                      | Rejects.                                            |
| TWAB > immutable hard maximum       | Rejects.                                            |
| TWAB between epoch cap and hard max | Uses epoch lower cap.                               |
| confidence > 10,000                 | Rejects.                                            |
| reward weight > 10,000              | Rejects.                                            |
| Per-qualification lower cap         | Reward clamps correctly.                            |
| Per-user lower cap                  | Aggregate user allocation cannot exceed cap.        |
| Total epoch cap                     | Aggregate epoch allocation cannot exceed cap.       |
| Remaining user cap zero             | Rejects further reward allocation.                  |
| Remaining epoch budget zero         | Rejects further reward allocation.                  |
| Insufficient actual USDC            | Rejects entitlement creation.                       |
| Qualification after epoch end       | Rejects.                                            |
| NOT\_QUALIFIED path                 | No onchain registration required.                   |
| Claim by recipient                  | Pays exact recorded USDC.                           |
| Claim by other address              | Rejects.                                            |
| Claim arbitrary receiver            | Impossible because no receiver parameter.           |
| Duplicate claim                     | Rejects.                                            |
| Partial claim                       | Impossible.                                         |
| Claim after epoch end               | Succeeds.                                           |
| Claim after long delay              | Succeeds; no expiry.                                |
| Oracle compromise                   | Cannot exceed qualification/user/epoch hard limits. |
| Epoch-manager compromise            | Cannot configure above immutable limits.            |
| Reward pause                        | Qualification/claim/openEpoch stop.                 |
| Reward pause vs saver funds         | Vault withdrawal unaffected.                        |
| Admin treasury sweep                | No interface exists.                                |
| Vault principal access              | No interface/path exists.                           |
| Strategy access                     | No interface/path exists.                           |

### Formula vectors

Hermes must include deterministic vectors.

Example:

```text
TWAB                  = 500 USDC
periodRatePpm         = 384
confidenceBps         = 10,000
rewardWeightBps       = 10,000

raw =
500 × 384 / 1,000,000
= 0.192 USDC

qualification cap     = 0.25
user remaining cap    = 0.75
epoch remaining       >= 0.192

reward                = 0.192 USDC

```

Example confidence reduction:

```text
TWAB             = 500 USDC
rate             = 384 ppm
confidence       = 8,000 bps
weight           = 10,000 bps

reward =
0.192 × 0.8
= 0.1536 USDC

```

All integer-unit expected outputs must be asserted exactly.

### Fuzz/invariant requirements

Use fuzz testing for:

- arbitrary deposit/mint/withdraw/redeem sequences;
- share/asset conversion and rounding;
- USDC 6-decimal boundaries;
- donation sizes before/after first deposit;
- automatic-deposit timestamps around exactly 604,800 seconds;
- reward TWAB within/beyond caps;
- arbitrary confidence/weight values;
- reward arithmetic rounding;
- arbitrary order of qualifications across users.

Use invariant testing for at least:

```text
vault.totalAssets()
≈ idle vault assets + strategy.totalAssets()

no successful automatic deposit for account A
can occur less than 604800 seconds after A's previous successful automatic deposit

strategy asset-moving functions
can only be called by vault

RewardController epoch.allocated
<= epoch.budget
<= MAX_TOTAL_REWARDS_PER_EPOCH

userAllocated[e][u]
<= epoch.userCap
<= MAX_REWARD_PER_USER_PER_EPOCH

qualification.reward
<= epoch.qualificationCap
<= MAX_REWARD_PER_QUALIFICATION

sum(unclaimed qualification rewards)
== totalOutstandingClaimable

reward token balance
>= totalOutstandingClaimable

one qualificationId
creates at most one entitlement

one qualificationId
can pay at most once

vault owner operations
cannot reduce arbitrary user principal/share balances

```

Mainnet-fork tests must include a real Aave Monad USDC reserve path before deployment.

---

## 18. External configuration to verify before implementation/deployment

Architecture must not hard-code stale planning-document facts.

### `CURRENT EXTERNAL CONFIG — VERIFY BEFORE DEPLOYMENT`

Current observations during this review:

**Monad chain ID**

Current Aave Monad address-book output identifies:

```text
CHAIN_ID = 143

```

**Canonical native Monad USDC**

Circle currently identifies:

```text
0x754704Bc059F8C67012fEd69BC8A327a5aafb603

```

as Monad mainnet USDC.

**USDC decimals**

Current Aave Monad address book identifies USDC decimals as:

```text
6

```

**Aave V3 Monad PoolAddressesProvider**

Current Aave address book:

```text
0x34793Fb9935F7bB5E5aE920fb963F39063E7A615

```

**Aave V3 Monad Pool**

Current Aave address book:

```text
0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef

```

**Aave USDC aToken**

Current Aave address book:

```text
0x35a73BAcb179d3740395A3ceCc87FF2e581d6042

```

**Aave interaction interface**

Implementation must pin the current Aave V3/Origin `IPool` interface used by the Monad deployment and verify:

- `supply`;
- `withdraw`;
- reserve configuration/status;
- aToken underlying lookup.

Current Aave documentation/interface confirms `withdraw(asset, amount, to)` returns the final withdrawn amount.

**Aave available-liquidity implementation assumption**

Before deployment/fork freeze, confirm current Monad reserve architecture still supports using:

```text
underlying.balanceOf(aToken)

```

as available reserve liquidity. Current official Aave vault code uses that method.

**OpenZeppelin Contracts**

Current audited 5.x documentation/changelog identifies **v5.6.1** as the latest audited release in the reviewed source, and OpenZeppelin recommends using tagged/published releases rather than the development branch.

Implementation baseline:

- pin an audited OpenZeppelin 5.x release;
- current candidate: `5.6.1`;
- recheck the audited `latest` release before dependency lock/deployment;
- never track `master`.

### Verification gate

Before deployment:

1. re-read current Circle Monad USDC source;
2. re-read current `AaveV3Monad` address-book output;
3. assert Pool and aToken bytecode exist on chain;
4. assert aToken underlying equals configured USDC;
5. assert USDC decimals == 6;
6. run Monad fork supply + withdraw tests;
7. run a tiny-value live mainnet transaction before the demo.

A current address changing does **not** change this architecture; it changes deployment configuration.

---

## 19. Canonical spec to create

Create:

```text
docs/specs/MVP Contract & Reward Specification.md

```

Title inside file:

```text
Kept MVP Contract & Reward Design Freeze — 08-Sep-2026

```

This specification becomes the implementation authority for MVP contracts beneath accepted Product Lead decisions.

For contract/reward implementation purposes it supersedes conflicting or obsolete portions of:

```text
docs/specs/Kept-MVP-Technical-Architecture-07-Sep-2026.txt
docs/specs/Kept-Monad-Yield-Source-Decision-07-Sep-2026.txt
docs/specs/Kept-MVP-Commitments-Verification-Spec-07-Sep-2026.txt
docs/specs/Kept-Behavioural-Reward-Economics-Framework-07-Sep-2026.txt
docs/specs/Kept-Privy-Implementation-Spec-07-Sep-2026.txt

```

Specifically superseded implementation assumptions include:

- standalone CommitmentRegistry;
- runtime strategy-management possibilities;
- cleartext onchain commitment type;
- provisional RewardController function shapes;
- provisional completion-score reward math;
- any suggestion that backend chooses arbitrary payout;
- any suggestion that Privy alone enforces the seven-day period;
- monthly/28-day reward settlement for the MVP contract;
- undefined reward ceilings;
- undefined claim destination;
- undefined pause authority.

The Product Outline remains the higher-level product source except where accepted Product Lead decisions explicitly refine it. Its current architecture already requires minimum qualification state, pre-funded behavioural rewards and non-custodial withdrawal behavior.

Specialist handoffs remain historical evidence and are **not rewritten**.

Also synchronize:

```text
docs/decisions/Product Lead Decision Log.txt

```

to include all accepted Product Lead decisions through KEPT-PL-020 before Milestone 3 is merged.

---

## 20. Final implementation gate

### Milestone 3 implementation gate

- Contract topology: **FROZEN**
- Vault interface/semantics: **FROZEN**
- Strategy interface/semantics: **FROZEN**
- RewardController interface/semantics: **FROZEN**
- Access-control model: **FROZEN**
- Reward arithmetic/encoding: **FROZEN**
- Immutable hard ceilings: **FROZEN**
- Initial demo epoch parameters: **FROZEN**
- Privacy/event boundary: **FROZEN**
- Test acceptance criteria: **FROZEN**
- External deployment addresses/config: **VERIFY BEFORE DEPLOYMENT**

**MILESTONE 3 IMPLEMENTATION MAY BEGIN**

---

## 21. Accepted post-Milestone 3 standard-vault yield-fee addendum

This section is controlled by KEPT-PL-022 and supersedes earlier no-fee assumptions only where they conflict with the requirements below. It does not authorize the still-unselected enhanced stablecoin-LP strategy.

### Economic limits

For the standard Aave vault:

```text
annualized fee ceiling = 100 basis points
positive-yield fee ceiling = 2,500 basis points
eligible fee = min(time-weighted annualized ceiling, positive-yield ceiling)
```

The current Aave-backed `KeptSavingsVault` must reject configuration above 100 annual basis points or 2,500 positive-yield basis points. The future enhanced profile must not be enabled by passing higher values to this standard-vault implementation.

The fee is zero when there is no eligible positive yield. It may never consume deposited principal. All division rounds down so rounding benefits savers.

For a future enhanced vault, the accepted ceilings are 200 basis points annualized and 2,000 basis points of eligible positive yield, but no enhanced contract may be deployed until KEPT-PL-021's remaining strategy and security decisions are accepted.

### Eligible positive yield and high-water mark

Eligible positive yield is the increase in total vault assets above a flow-adjusted post-fee high-water benchmark. Deposits and mints increase the benchmark by the capital added. Withdrawals and redemptions reduce it in proportion to the shares burned. This preserves the existing loss hurdle without treating capital flows as profit. The calculation includes strategy return and canonical-USDC donations because both increase assets available to shareholders.

If total assets fall below the flow-adjusted high-water benchmark:

- no fee is created;
- recovery back to the previous high-water mark is not new eligible yield;
- only value above that mark may subsequently create a fee.

When the vault has no issued user or fee shares, pending fee capacity and the flow-adjusted high-water benchmark return to zero. A later depositor must not inherit fee liability from a previous empty vault.

### Time-weighted annualized ceiling

The vault checkpoints elapsed time and a flow-adjusted fee basis around every share-changing operation. A deposit or mint first crystallizes any currently eligible fee, then clears previously accrued annual-fee capacity and moves any remaining above-water but unchargeable gain into the high-water benchmark before adding the new capital. A new depositor therefore cannot inherit historical fee time or an existing uncrystallized gain. Deposits during a loss still add to, rather than erase, the existing recovery hurdle. Capacity associated with redeemed capital must not remain available to charge the remaining shareholders. The accounting may conservatively forgo platform revenue, but it must not overcharge savers.

This saver-favouring reset means repeated small successful inflows can reduce or forgo platform fee revenue. That is an accepted revenue-only trade-off for this standard-vault design: it cannot increase a saver charge, create fee authority over principal or move saver assets. Kept should monitor the behavior and revisit the fee architecture through a new accepted decision if it becomes economically material.

The annual ceiling uses the lower of the prior checkpoint basis and the currently observed asset balance for the elapsed interval. It does not claim to reconstruct an unobserved intra-interval Aave balance path. This lower-endpoint rule is saver-conservative when a loss is visible at settlement, and the current observed balance becomes the next interval's basis. The separate high-water mark continues to exclude loss recovery from eligible positive yield.

### Crystallization and settlement

Any account may call the explicit crystallization function. The vault also crystallizes before calculating shares or assets for every `deposit`, `mint`, `withdraw` and `redeem` operation.

ERC-4626 conversion and preview views must include shares that would be minted by an immediately pending crystallization, so a same-block state-changing operation does not return a worse result than its preview merely because the operation crystallizes fees first.

An eligible fee is settled only by minting the deterministic number of vault shares required to represent no more than the calculated fee assets. Those shares are minted directly to the immutable fee recipient and dilute existing shares only by the bounded fee amount. The fee recipient redeems through the ordinary ERC-4626 path and remains subject to current strategy liquidity.

There is no:

- direct transfer of saver USDC to the fee recipient;
- owner-set fee amount;
- mutable fee rate;
- mutable fee recipient;
- fee-recipient strategy authority;
- principal or aToken rescue function;
- use of uncrystallized or realized platform fees as an unfunded behavioural-reward promise.

### Required tests

Deterministic, fuzz and stateful tests must establish at minimum:

1. a 4.5% annualized standard-vault return cannot create more than a 1-percentage-point annualized fee;
2. the fee cannot exceed 25% of eligible positive yield;
3. zero yield, loss and recovery to the previous high-water mark create zero fee;
4. deposits, mints, withdrawals and redemptions do not themselves create fees;
5. a new depositor does not pay a retroactive annualized fee;
6. withdrawing capital cannot leave fee capacity that overcharges remaining savers;
7. donations cannot let the donor extract value or give an administrator arbitrary mint authority;
8. fee-share rounding never exceeds the calculated fee assets;
9. fee crystallization cannot block withdrawal merely because the vault is paused;
10. fee-recipient shares have no strategy or principal-seizure authority;
11. empty-vault reset removes prior fee liability;
12. existing donation, reentrancy, liquidity and principal-isolation properties remain true.