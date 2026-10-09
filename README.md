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

Kept is available as a Progressive Web App (PWA), allowing users to install it directly onto their device's home screen without downloading it from an app store.

On Android, users can install Kept through Chrome using the **Install app** or **Add to Home screen** option. On iOS, users can open Kept in Safari and select **Share → Add to Home Screen**.

Once installed, Kept launches in a standalone window, providing an app-like experience without the standard browser interface.

The PWA includes dedicated application icons, a web app manifest, and a service worker that caches static assets while ensuring sensitive account data and financial information remain network-only.

An internet connection is required for authentication, live balances, transaction quotes, deposits, withdrawals, and other financial operations. Offline financial transactions are not supported.

For implementation details, configuration, and testing instructions, see the [web app documentation](https://github.com/slothmock/kept/blob/staging/apps/web/README.md).

## Development

Kept uses an npm-workspaces monorepo containing the frontend, backend API, smart contracts, and shared packages.

Use a compatible Node.js version as specified in the `engines` field of [package.json](https://github.com/slothmock/kept/blob/staging/package.json).

Install dependencies and run the development checks from the repository root:

```bash
npm ci
npm run typecheck
npm test
npm --workspace @kept/web run lint
npm --workspace @kept/web run build
forge test --root packages/contracts
```

Local development requires the appropriate API, database, blockchain, and frontend configuration. Refer to [`.env.example`](https://github.com/slothmock/kept/blob/staging/.env.example) for the supported environment variables.

**Security:** Never commit private keys, API secrets, credentials, or other sensitive configuration values to the repository.

The Monad Mainnet Aave fork test is maintained separately from standard contract tests. Running it requires a compatible Monad execution environment and access to a Monad Mainnet RPC endpoint.  

## License

No license has been selected yet. The source is publicly visible, but public visibility alone does not grant permission to reuse, modify or redistribute it.
