-- One claim per finalized vault Deposit log, independent of user id.
CREATE TABLE "allocation_deposit_claims" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "ledger_event_id" uuid,
  "chain_id" bigint NOT NULL,
  "vault_address" text NOT NULL,
  "transaction_hash" text NOT NULL,
  "log_index" integer NOT NULL,
  "shares_atomic" numeric(78,0) NOT NULL,
  "status" text NOT NULL,
  "created_at" timestamptz NOT NULL,
  CONSTRAINT "allocation_deposit_claims_shares_positive" CHECK ("shares_atomic" > 0),
  CONSTRAINT "allocation_deposit_claims_status_valid" CHECK ("status" IN ('CREDITED','ALREADY_REFLECTED')),
  CONSTRAINT "allocation_deposit_claims_credit_consistency" CHECK (
    ("status" = 'CREDITED' AND "ledger_event_id" IS NOT NULL) OR
    ("status" = 'ALREADY_REFLECTED' AND "ledger_event_id" IS NULL)
  ),
  CONSTRAINT "allocation_deposit_claims_event_owner_fk"
    FOREIGN KEY ("ledger_event_id","user_id") REFERENCES "allocation_ledger_events"("id","user_id")
);
CREATE UNIQUE INDEX "allocation_deposit_claims_log_unique" ON "allocation_deposit_claims"
  ("chain_id",lower("vault_address"),lower("transaction_hash"),"log_index");
CREATE INDEX "allocation_deposit_claims_user_idx" ON "allocation_deposit_claims"("user_id","created_at");
