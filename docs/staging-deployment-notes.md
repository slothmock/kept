# Staging deployment notes

## Redeploy savings vault with the current deposit fee

The current Monad testnet savings vault deployed for staging still reports a
deposit fee of 50 bps (0.5%), while the current `KeptSavingsVault.sol` source
uses 20 bps (0.2%).

The web app deliberately reads `DEPOSIT_FEE_BPS` from the deployed vault when
building the Add to savings quote, so staging currently displays and charges
0.5% even though the repository source now specifies 0.2%.

### Required follow-up

- Redeploy the staging `KeptSavingsVault` using the current contract source.
- Rebind/configure any required staging strategy dependencies.
- Update the staging API and web vault addresses to the new deployment.
- Verify `DEPOSIT_FEE_BPS()` returns `20`.
- Verify an Add to savings request for 50 USDC shows approximately:
  - 50 USDC added to savings
  - 0.100200 USDC deposit fee
  - 50.100200 USDC total from available cash
  - 0.20% fee rate
- Re-run the staging savings flow after the address update.
