# API update — Kept MVP alignment

Updated for the current Kept contract and commitment-catalogue design.

## Catalogue alignment
- Supports only `WEEKLY_SAVINGS_V1` (`ONCHAIN`) and `ACTIVITY_COUNT_V1` (`EXTERNAL`).
- Removed `SOCIAL` verification class and the old study-session catalogue seed.

## Commitment lifecycle
The API persistence lifecycle is now:
- `DRAFT`
- `ACTIVE`
- `COMPLETED`
- `FAILED`
- `CANCELLED`

User-facing API work in this package currently covers draft creation, activation, and cancellation. Completion/failure is reserved for the verifier integration.

## HTTP routes restored
- `GET /v1/me`
- `GET /v1/goals`
- `POST /v1/goals`
- `GET /v1/goals/:id`
- `GET /v1/commitments`
- `POST /v1/commitments`
- `GET /v1/commitments/:id`
- `POST /v1/commitments/:id/activate`
- `POST /v1/commitments/:id/cancel`

Write routes require an `idempotency-key` header.

## Vault authority boundary
The API still does not expose authoritative deposit/withdraw/redeem/share mutation endpoints. Financial ownership remains onchain.

## Database note
The initial migration and Drizzle snapshot were updated to the simplified enums. If a local development database was created from the old migration, reset/recreate it before applying this package; this archive updates the initial migration rather than adding a production data migration.

## Validation note
The extracted package does not include the monorepo root `tsconfig.base.json`, installed dependencies, or the sibling `@kept/commitment-catalogue` workspace package, so the full TypeScript/Vitest suite could not be executed in isolation here. A syntax pass was performed; run the normal workspace test/typecheck commands after replacing the package in the repo.
