# Monad Mainnet deployment preflight (chain 143)

This is the **production** deployment. Do not broadcast until CI, fork tests,
funding checks, and the separate approval for live deployment have passed.

## Roles

| Role | Address |
| --- | --- |
| Deployment signer / initial owner | `0x8EAAbFE87006cd771ad389B780b1CA3f6C513660` |
| API commitment verifier | `0xb702e98550EDc545cE407eA49A5Ba4343727d2F1` |
| Final administrator (2-of-3 Safe) | `0xF13040db22dB552b8bC89C33F181491E91A6f7e1` |

The deployment signer and verifier must not be Safe owners. Verify the actual
Safe signer set and threshold in Safe before a live deployment.

## Local environment (PowerShell)

From `packages/contracts`:

```powershell
$env:MONAD_MAINNET_RPC_URL = "https://rpc.monad.xyz"
$env:MAINNET_OWNER = "0x8EAAbFE87006cd771ad389B780b1CA3f6C513660"
$env:MAINNET_COMMITMENT_VERIFIER = "0xb702e98550EDc545cE407eA49A5Ba4343727d2F1"
$env:MAINNET_ADMIN_SAFE = "0xF13040db22dB552b8bC89C33F181491E91A6f7e1"
$env:ENABLE_MONAD_MAINNET_DEPLOY = "true"
# Set MAINNET_DEPLOYER_PRIVATE_KEY locally from a secure source.
# Never paste the secret into chat, code, committed env files or CI logs.

forge test --network monad --match-contract MonadMainnetPreflightTest -vvv

# DRY RUN: deliberately omit --broadcast.
forge script script/DeployMonadMainnet.s.sol:DeployMonadMainnet --rpc-url $env:MONAD_MAINNET_RPC_URL -vvvv
```

The Forge script checks chain ID 143, the expected Aave USDC reserve, and
that the admin Safe is a deployed contract. It derives the deployer address
from `MAINNET_DEPLOYER_PRIVATE_KEY` and rejects a mismatch with `MAINNET_OWNER`.
The script uses `vm.startBroadcast(signerKey)` in both simulation and real
broadcast modes. **Without the CLI `--broadcast`, no deployment transactions
are sent.**

The dry run must successfully simulate deploying the treasury, vault,
strategy and commitment manager; binding their relationships; and initiating
`transferOwnership(MAINNET_ADMIN_SAFE)` on vault, treasury and manager.
The Safe must later execute `acceptOwnership()` on each contract using
its 2-of-3 approval flow. Until acceptance, the deployer remains owner.

## Verify before authorising real transactions

- Confirm the Safe has code on Monad chain 143 and the expected three signers
  with a threshold of two.
- Confirm the deployer and API verifier public addresses match the wallet keys.
- Confirm the vault USDC asset, strategy Aave pool and aUSDC addresses.
- Confirm simulated ownership fields: `owner() == MAINNET_OWNER` and
  `pendingOwner() == MAINNET_ADMIN_SAFE` for all three contracts.
- Ensure the deployment signer has enough MON for gas; verifier also needs
  MON for future settlement transactions.
- Set up a separately funded USDC treasury. Without available treasury backing,
  verification cannot reserve completion rewards.
- Set Mainnet API variables: `MONAD_CHAIN_ID=143`, `MONAD_RPC_URL`,
  `COMMITMENT_MANAGER_ADDRESS`, `KEPT_SAVINGS_VAULT_ADDRESS`,
  `COMMITMENT_VERIFIER_PRIVATE_KEY`, `VAULT_ACTIVITY_INDEX_MAINNET_START_AT`
  (no later than first vault activity), and correct production `WEB_ORIGIN`.
- Set matching web chain ID `143`, USDC, vault, manager and API address.
- Keep fiat disabled unless its provider integration is separately approved.
- Do not mistake a successful Forge simulation for a live deployment, completed
  Safe signature threshold test, or treasury funding.

**A live deployment requires a separate explicit approval and a command with
`--broadcast`. No broadcast command is included in this runbook.**


## Launch reserve and funding policy

**Planned initial reward treasury reserve: 100 USDC.** This is a planned
operational reserve, not a deposit or contract-level collateral requirement.
**Do not transfer the reserve until the contracts are deployed and verified.**
Send canonical Monad USDC to the verified `KeptTreasury` contract address,
*never* to a simulated address, deployer, verifier, or vault by mistake.
The treasury recognizes directly transferred idle USDC through
`availableRewardAssets()`; no deposit function is required.

At 10 bps (0.1%) of the verified weekly target, each reward is capped at
10 USDC. The API currently warns when available unreserved reward value is
below 10 USDC. This is a log warning, not a pager or automatic top-up.
Maintain a separately controlled MON balance for the API verifier to settle
commitments. Rewards are Kept-funded, not taken from users' savings.

## Final production readiness gates (must be reviewed before broadcast)

- [ ] **Security review:** The fork test and script simulation are not a
  security audit. Review vault ERC-4626 accounting, fee crystallization,
  Aave liquidity/withdrawal behavior, reward reservations, pause behavior,
  and privileged/admin operations. Complete an independent review appropriate
  to the amount of user funds before public deposits.
- [ ] **Deployment provenance:** Freeze reviewed commit, compiler settings,
  deployment script, RPC chain ID, USDC/Aave addresses, signer address and
  starting nonce. Re-run non-broadcast simulation immediately before approval.
  Simulated contract addresses are *not* live addresses; live nonce/order
  changes will change predictions.
- [ ] **Safe governance:** Independently verify Safe contract, 3 owners,
  2-of-3 threshold, and ability to execute on Monad. Once deployed,
  execute `acceptOwnership()` from the Safe for vault, treasury and manager,
  then verify onchain `owner()` equals the Safe and `pendingOwner()` is zero.
  Before acceptance, the deployer is still the owner.
- [ ] **Production isolation:** Configure distinct Railway service/database,
  Privy configuration, Vercel deployment, logging and credentials for
  `hackathon.keptfinance.app`. Leave `main` public waitlist and `staging`
  testnet unchanged. Restrict CORS / `WEB_ORIGIN` to the approved frontend
  origins. Review all external funding and withdrawal network routes against
  the production chain and contract addresses.
- [ ] **Required API settings:** `MONAD_CHAIN_ID=143`,
  `MONAD_RPC_URL`, `COMMITMENT_MANAGER_ADDRESS`,
  `KEPT_SAVINGS_VAULT_ADDRESS`, `COMMITMENT_VERIFIER_PRIVATE_KEY`,
  `VAULT_ACTIVITY_INDEX_MAINNET_START_AT` no later than first user vault
  event, `DATABASE_URL`, `WEB_ORIGIN`, Privy and Aurora credentials.
  Derive the configured verifier's public address and compare with
  `0xb702e98550EDc545cE407eA49A5Ba4343727d2F1`.
  Keep private keys only in protected secrets, never Git or shared logs.
- [ ] **Required web settings:** `VITE_MONAD_CHAIN_ID=143`,
  `VITE_MONAD_RPC_URL`, `VITE_MONAD_USDC_ADDRESS`,
  `VITE_KEPT_VAULT_ADDRESS`, `VITE_COMMITMENT_MANAGER_ADDRESS`,
  `VITE_KEPT_API_URL`, `VITE_PUBLIC_LAUNCH_MODE=live`,
  production Privy app ID; leave `VITE_FIAT_ENABLED=false` until
  approved. Note: `VITE_*` values are publicly visible in client bundles.
- [ ] **Onchain cross-check:** After deployment and before user access,
  verify vault asset, fee recipient, strategy, treasury vault,
  reward manager, manager treasury, manager verifier, ownership, and
  Aave reserve against independently reviewed expected values.
- [ ] **Operations:** Confirm verifier MON gas balance, initial 100 USDC
  treasury funding transfer, treasury's actual available USDC, logging/
  alert ownership, indexer catching historical deposits, and database
  recovery plan. Ensure failed verifications caused by RPC outages or
  low treasury funds remain retryable and cannot silently penalize savers.
- [ ] **Controlled production smoke test:** Execute small real-USDC
  deposit/withdrawal, commitment activation/verification/reward claim,
  treasury accounting and Safe emergency pause/unpause procedures,
  with pre-agreed test limits and rollback criteria.

**No Mainnet broadcast, treasury transfer, environment change, or domain
switch is authorized by this document.** Obtain separate explicit approval
for each live action.

## Contract hardening in PR #65

- The vault's `maxDeposit()` reads Aave V3 reserve active, frozen, paused
  flags and the whole-token supply cap against current aToken supply.
  An RPC/fork integration test must confirm the Monad reserve configuration
  is compatible before live deployment.
- On commitment-manager pause, new commitments and verification are blocked,
  but already completed rewards remain claimable **unless the treasury itself
  is paused**, liquidity is unavailable, or another payout condition fails.
- Safe-admin `rescueStrategyToken()` can retrieve unrelated ERC-20 tokens
  from the active Aave strategy; canonical USDC and aUSDC remain protected.
- Safe-admin `migrateStrategy()` requires the vault to be paused. It moves
  the **entire** existing strategy position to an independently reviewed
  replacement, without changing user share balances. It reverts atomically
  if the old strategy cannot withdraw all assets. **It cannot bypass an Aave
  liquidity shortfall or an Aave withdrawal freeze.** Do not unpause until
  the replacement's asset/vault bindings and resulting accounting are verified.

The verifier's trusted settlement authority remains an operational-security
responsibility; these contract changes do not reduce it.
