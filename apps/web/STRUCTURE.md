# Web package structure

The web package is organised around application responsibilities rather than keeping all files in `src/`.

```text
src/
  api/          API client and API DTOs
  auth/         Privy/session state
  chain/        EVM wallet, transaction sender, local-chain config
  components/   Shared presentational components
  features/     Feature-specific UI (dashboard, landing)
  legacy/       Retained but unused legacy integrations
  screens/      Route-level screens
  vault/        Vault configuration, reads, transaction builders/execution

tests/
  api/          API client tests
  auth/         Session/wallet tests
  config/       Environment and chain/vault config tests
  ui/           Screen/navigation/integration-style UI tests
  vault/        Vault unit tests
  support/      Browser/manual test harness
```

`src/legacy/kept-solana-wallet.ts` is retained for reference but is not used by the current Monad/EVM application.
