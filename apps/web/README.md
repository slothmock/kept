# Kept web app

The consumer-facing frontend lives in `apps/web`. It is a React + TypeScript application built with Vite, Tailwind CSS and component primitives from shadcn/Base UI. This README documents the **current app**, not the retired frontend-rebuild archive.

## Development

Run commands from the repository root. Use a supported Node.js version from the root `package.json`, and copy the relevant settings from `.env.example` into your local, ignored environment configuration.

```bash
npm ci
npm --workspace @kept/web run dev
```

The Vite development server uses port **5173**. The API is a separate workspace and must also be configured and running for authenticated account data and transactions.

Useful commands:

```bash
npm run typecheck
npm test
npm --workspace @kept/web run lint
npm --workspace @kept/web run build
npm --workspace @kept/web run preview
```

`npm test` includes tests from multiple workspaces; contract tests run separately with `forge test --root packages/contracts`.

## Structure

- `src/main.tsx`: app bootstrap and global diagnostics
- `src/app/`: providers, authentication/session handling, routing and shared app shell
- `src/features/`: dashboard, savings, goals, commitments, funding, withdrawals, activity, account and public pages
- `src/wallet/`: embedded/external wallet interactions and vault transactions
- `src/api/`: typed calls to the Kept API
- `src/components/ui/`: reusable UI components
- `src/assets/`: brand assets and other bundled images
- `test/`: frontend tests

The main authenticated routes include `/dashboard`, `/goals`, `/commitments`, `/add-money`, `/withdraw`, `/activity` and `/account`. Public launch mode is controlled using `VITE_PUBLIC_LAUNCH_MODE` (`waitlist` or `live`).

## Configuration

Refer to the repository's [`.env.example`](../../.env.example) for the complete list. Relevant web variables include:

- `VITE_KEPT_API_URL`, `VITE_PRIVY_APP_ID`: backend and Privy setup
- `VITE_MONAD_RPC_URL`, `VITE_MONAD_CHAIN_ID`: selected network
- `VITE_KEPT_VAULT_ADDRESS`, `VITE_COMMITMENT_MANAGER_ADDRESS`, `VITE_MONAD_USDC_ADDRESS`: deployed contract addresses
- `VITE_PUBLIC_LAUNCH_MODE`: waitlist vs live site
- `VITE_FIAT_ENABLED`: feature flag for fiat-related flows

`VITE_*` values are exposed in the browser bundle. **Do not put secrets or private keys in them.** Contract addresses must match the selected chain, and API-side configuration must match the same deployment.

## Installable PWA (pending PR #52)

[PR #52](https://github.com/slothmock/kept/pull/52) adds Progressive Web App (PWA) support. **It is still a separate feature branch**; this section describes the intended setup once merged and deployed.

It adds:

- `public/manifest.webmanifest`: name, `/dashboard` start URL, app scope, standalone display and install icon URLs
- Build-emitted 192px/512px icons sourced from the existing Kept logo
- `public/sw.js` and `src/lib/register-service-worker.ts`: same-origin static-asset caching
- Installation guidance within the Account screen
- `test/pwa-install.test.ts`: manifest and cache-policy regression checks

### Installing on a phone

**Android (Chrome):** Visit the deployed site over HTTPS, open the browser menu, choose **Install app** or **Add to Home screen**, and confirm.

**iOS (Safari):** Visit the deployed site, tap **Share → Add to Home Screen**, select **Open as Web App** if available, and tap **Add**.

Once installed, launch Kept from the device's home screen. Installation availability varies by browser and device. On a pre-launch/waitlist deployment, the app may still route users to the waitlist until live mode is enabled.

### Service worker and security

The service worker uses a conservative, **network-first** policy restricted to same-origin, build-versioned static JS/CSS/image/font assets. It does not intercept navigation responses or cache API, RPC or authenticated financial requests. There is no offline balance display or offline transaction queue.

Financial data must remain fresh: wallet balances, approvals, quotes, deposits, withdrawals, commitment state and sign-in all require connectivity. Never broaden the service worker's cache rules to cover authenticated or transaction endpoints without a dedicated security review.

### Manual QA before merge/release

1. Build and deploy the PWA branch to HTTPS; check the manifest and icon URLs return correctly.
2. Verify Android Chrome and iOS Safari installation, standalone launch and navigation.
3. Check Privy authentication and embedded-wallet session persistence in standalone mode.
4. Verify online balance refresh, deposit/withdrawal actions and transaction history.
5. Check an offline launch and loss-of-connection behaviour: do not show stale financial data as current.
6. Verify updates after redeployment and that previously cached static assets do not break the current app.

## Deployment

The frontend is deployed via Vercel. `vercel.json` provides SPA route fallback to `index.html`. Ensure the frontend and API are pointed at the same network and that HTTPS and supported origin/redirect URLs are configured for Privy and any funding providers. Re-test PWA installation when changing deploy domains or authentication redirects.

For higher-level project and hackathon context, see the [root README](../../README.md).
