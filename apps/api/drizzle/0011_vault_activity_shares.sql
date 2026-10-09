-- Preserve ERC-4626 minted/burned shares alongside indexed vault events.
-- Nullable: previously indexed events have no trustworthy share quantity.
ALTER TABLE "vault_activity_events" ADD COLUMN "shares_atomic" numeric(78,0);
ALTER TABLE "vault_activity_events"
  ADD CONSTRAINT "vault_activity_events_shares_nonnegative"
  CHECK ("shares_atomic" IS NULL OR "shares_atomic" >= 0);
