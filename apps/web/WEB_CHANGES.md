# Kept web alignment changes

This package was updated to match the current Kept MVP architecture.

## Product/navigation

- Removed the authenticated `/vaults` product route and the Vaults navigation item.
- Removed the Sponsors public route/link from the MVP surface.
- Removed the old study/social verification copy.
- Verification now describes only weekly savings and externally verified activity commitments.
- Reward copy now describes rewards as funded from Kept-owned earned revenue.

## API integration

- Added `src/api-client.ts` for authenticated calls to the Kept API.
- The client uses the Privy access token from the existing session.
- `VITE_KEPT_API_URL` is optional and defaults to `http://127.0.0.1:3000`.
- Goal/commitment writes automatically send an `idempotency-key` header.

## Dashboard

- Dashboard is now goal/commitment-first rather than vault-first.
- Existing vault deposit/withdraw flows are retained as supporting actions.
- Added goal creation.
- Added weekly savings and activity-count commitment creation.
- New commitments are created as drafts and then activated through the API.
- Added goal detail UI and commitment status UI.
- Commitments explicitly state that they never lock savings.

## Progress data

The current API does not persist per-goal vault allocations. The UI therefore does not invent per-goal balances. A progress percentage is shown only when there is exactly one active goal, where the total Kept balance can be compared to that single target without ambiguity.

## Reward claiming

The UI shows verified commitment state, but a functional reward-claim button has intentionally not been added yet. The API/onchain settlement adapter still needs to expose the onchain commitment settlement/claim linkage first.

## Local environment

Add this to the web env if the API is not running on the default local address:

```env
VITE_KEPT_API_URL=http://127.0.0.1:3000
```

## File organisation

- Moved all automated tests out of `src/` into a dedicated `tests/` tree grouped by API, auth, config, UI and vault responsibilities.
- Grouped production utilities into `src/api`, `src/auth`, `src/chain` and `src/vault`.
- Preserved the unused legacy Solana wallet hook under `src/legacy/` instead of deleting it.
- Updated TypeScript include paths and all moved imports.
- Moved the browser/manual test harness to `tests/support/`.
