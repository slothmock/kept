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
