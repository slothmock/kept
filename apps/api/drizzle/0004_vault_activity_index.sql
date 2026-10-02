CREATE TABLE "vault_activity_events" (
  "id" uuid PRIMARY KEY NOT NULL,
  "chain_id" bigint NOT NULL,
  "vault_address" text NOT NULL,
  "account_address" text NOT NULL,
  "event_type" text NOT NULL,
  "assets_atomic" numeric(78, 0) NOT NULL,
  "block_number" bigint NOT NULL,
  "transaction_hash" text NOT NULL,
  "log_index" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "vault_activity_events_type_valid" CHECK ("vault_activity_events"."event_type" IN ('DEPOSIT', 'WITHDRAW')),
  CONSTRAINT "vault_activity_events_assets_nonnegative" CHECK ("vault_activity_events"."assets_atomic" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "vault_activity_events_chain_vault_log_unique" ON "vault_activity_events" USING btree ("chain_id",lower("vault_address"),"transaction_hash","log_index");
--> statement-breakpoint
CREATE INDEX "vault_activity_events_account_idx" ON "vault_activity_events" USING btree ("chain_id",lower("vault_address"),lower("account_address"));
--> statement-breakpoint
CREATE TABLE "vault_activity_cursors" (
  "id" uuid PRIMARY KEY NOT NULL,
  "chain_id" bigint NOT NULL,
  "vault_address" text NOT NULL,
  "last_processed_block" bigint NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "vault_activity_cursors_chain_vault_unique" ON "vault_activity_cursors" USING btree ("chain_id",lower("vault_address"));