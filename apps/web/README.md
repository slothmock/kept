# Kept frontend UI rebuild

This archive is a drop-in replacement for the presentation layer of `apps/web`.
It deliberately does **not** replace the working API/auth/chain/vault infrastructure.

## Keep from the existing app

- `src/api/`
- `src/auth/`
- `src/chain/`
- `src/vault/`
- `src/_legacy/` (temporarily, because `app.tsx` still uses the existing public information pages)
- existing test infrastructure

## Replace / add

Copy the files in this archive into `apps/web/`:

- `components.json`
- `vite.config.ts`
- `tsconfig.json` (or merge the alias/include changes)
- `src/styles.css`
- `src/app.tsx`
- `src/main.tsx`
- `src/DashboardApp.tsx`
- `src/lib/`
- `src/components/`
- `src/features/`
- `src/pages/`

## Install UI dependencies

From the repository root:

```bash
npm install tailwindcss @tailwindcss/vite shadcn class-variance-authority cn lucide-react tw-animate-css @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-progress @radix-ui/react-slot
```

If this monorepo uses workspace-scoped installs, install those dependencies into `@kept/web` instead.

The setup follows the current shadcn Vite model: Tailwind v4 through `@tailwindcss/vite`, an `@/*` alias, `components.json`, and owned component source under `src/components/ui/`.

## Product flow implemented

The new authenticated dashboard is intentionally simple:

1. See total balance and active goals.
2. Add or withdraw money.
3. See goals as the primary content.
4. Each goal shows its current commitment.
5. Create goals in a dialog.
6. Add either a weekly savings commitment or an activity-count commitment.
7. Open goal details without duplicating a separate commitments dashboard.
8. Account/wallet details stay secondary in the account menu.

No Aave, ERC-4626, shares, strategy, or contract terminology is presented in the primary UI.

## Important existing interfaces assumed

This UI expects the current project interfaces already discussed:

- `src/api/kept-api.ts`
- `src/auth/session.ts`
- `src/auth/privy-session.tsx`
- `src/chain/evm-wallet.ts`
- `src/chain/transaction-sender.ts`
- `src/chain/local-anvil-chain.ts`
- `src/vault/config.ts`
- `src/vault/deposit-input.ts`
- `src/vault/executor.ts`
- `src/vault/position.ts`
- `src/vault/transactions.ts`

It also temporarily imports:

```text
src/_legacy/screens/PublicInformationScreen.tsx
```

for Privacy / Terms / Verification routes. Those can be rebuilt later without affecting the dashboard.

## Suggested first run

```bash
npm run build --workspace @kept/web
```

Then run the existing web tests. Some old UI tests will intentionally need replacement because the old dashboard markup no longer exists.
