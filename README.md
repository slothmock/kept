# Kept

**Save toward something. Keep your commitments. Earn more for following through.**

Kept is an experimental behavioural savings app built on [Monad](https://www.monad.xyz/). It combines savings goals, weekly saving commitments, and on-chain settlement with an experience designed for people who do not need to manage crypto directly.

## How Kept works

Users can add funds to their embedded wallet, deposit USDC into savings, create goals, and track progress. They can opt into supported commitments; qualifying commitments may earn additional bounded rewards after verification. Savings remain withdrawable independently of whether a commitment succeeds.

The app offers a dashboard, goal management, commitment tracking, activity history, wallet funding and withdrawal flows. Available funding and withdrawal routes depend on the network, provider availability, and feature flags.

## Architecture and integrations

- **Web:** React, TypeScript, Vite, Tailwind CSS, shadcn/Base UI
- **API:** Node.js, Fastify, PostgreSQL, Drizzle
- **Contracts:** Solidity, Foundry, an ERC-4626 savings vault, treasury, strategy, and commitment manager
- **Network:** Monad for vault activity and commitment settlement
- **Wallets:** Privy authentication and embedded wallets
- **External funding:** Aurora Intents for supported cross-chain routes; MoonPay integration subject to provider availability and configuration
- **Yield:** `StagingYieldStrategy` simulates time-based yield on Monad Testnet. `AaveUSDCStrategy` is the separate mainnet-oriented strategy; **testnet yield is not supplied by Aave**.

Deposits, withdrawals and supported commitment settlement actions are real on-chain transactions on the configured network, even when the testnet yield is simulated. USDC used in the staging faucet is testnet-only and is not real money.

## Monad Metropolis hackathon

Kept is being prepared for the **Monad Metropolis** hackathon, in the **Consumer Products & Payments** track. The immediate priority is validating its testnet deployment and end-to-end user flows, not releasing production financial infrastructure.

**Status:** The core application is implemented and undergoing deployment and end-to-end verification. Mainnet Aave integration and production-grade operational safeguards are separate work. Kept is unaudited experimental financial software; do not assume testnet results establish mainnet safety.

## Installable web app (PWA)

Install support is being developed in [PR #52](https://github.com/slothmock/kept/pull/52) and is **not part of `staging` until that PR merges**. Once deployed, users can add Kept to an Android home screen through Chrome, or to an iPhone home screen through Safari's **Share → Add to Home Screen** flow. Supported browsers may offer an **Install app** action.

Installing Kept does **not** enable offline financial operations. Balances, authentication, quotes, deposits and withdrawals require a network connection. See [web app documentation](apps/web/README.md) for implementation and verification details.

## Development

This is an npm-workspaces monorepo. Use a compatible Node.js version (see the `engines` field in [package.json](package.json)), then:

```bash
npm ci
npm run typecheck
npm test
npm --workspace @kept/web run lint
npm --workspace @kept/web run build
forge test --root packages/contracts
```

For local API/web environment settings, start from [`.env.example`](.env.example). **Never commit private keys, API secrets or real credentials.** The Monad mainnet fork test is a separate opt-in check and requires a compatible Monad execution environment and mainnet RPC.

## License

No license has been selected yet. The source is publicly visible, but public visibility alone does not grant permission to reuse, modify or redistribute it.
