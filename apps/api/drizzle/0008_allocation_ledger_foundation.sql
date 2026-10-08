-- Schema-only migration. Opening positions require a later live-chain cutover.
CREATE TABLE "allocation_buckets" (
 "id" uuid PRIMARY KEY NOT NULL,
 "user_id" uuid NOT NULL REFERENCES "users"("id"),
 "bucket_kind" text NOT NULL,
 "goal_id" uuid,
 "created_at" timestamptz NOT NULL,
 CONSTRAINT "allocation_buckets_kind_check" CHECK (("bucket_kind" = 'UNASSIGNED' AND "goal_id" IS NULL) OR ("bucket_kind" = 'GOAL' AND "goal_id" IS NOT NULL)),
 CONSTRAINT "allocation_buckets_id_user_unique" UNIQUE ("id","user_id"),
 CONSTRAINT "allocation_buckets_goal_owner_fk" FOREIGN KEY ("goal_id","user_id") REFERENCES "savings_goals"("id","user_id")
);
CREATE UNIQUE INDEX "allocation_unassigned_unique" ON "allocation_buckets" ("user_id") WHERE "bucket_kind" = 'UNASSIGNED';
CREATE UNIQUE INDEX "allocation_goal_unique" ON "allocation_buckets" ("user_id","goal_id") WHERE "bucket_kind" = 'GOAL';

CREATE TABLE "allocation_ledger_events" (
 "id" uuid PRIMARY KEY NOT NULL,
 "user_id" uuid NOT NULL REFERENCES "users"("id"),
 "event_kind" text NOT NULL,
 "idempotency_key" text,
 "transaction_hash" text,
 "created_at" timestamptz NOT NULL,
 CONSTRAINT "allocation_ledger_events_id_user_unique" UNIQUE ("id","user_id"),
 CONSTRAINT "allocation_ledger_events_kind_check" CHECK ("event_kind" IN ('OPENING','TRANSFER','VAULT_CREDIT','VAULT_DEBIT','RECONCILIATION_CREDIT','RECONCILIATION_DEBIT'))
);
CREATE UNIQUE INDEX "allocation_ledger_event_idempotency_unique" ON "allocation_ledger_events" ("user_id","idempotency_key") WHERE "idempotency_key" IS NOT NULL;
CREATE INDEX "allocation_ledger_events_user_created_idx" ON "allocation_ledger_events" ("user_id","created_at");

CREATE TABLE "allocation_ledger_entries" (
 "id" uuid PRIMARY KEY NOT NULL,
 "event_id" uuid NOT NULL,
 "user_id" uuid NOT NULL,
 "bucket_id" uuid NOT NULL,
 "share_delta_atomic" numeric(78,0) NOT NULL,
 "origin_event_id" uuid,
 "origin_kind" text NOT NULL,
 "created_at" timestamptz NOT NULL,
 CONSTRAINT "allocation_ledger_entries_delta_check" CHECK ("share_delta_atomic" <> 0),
 CONSTRAINT "allocation_ledger_entries_origin_check" CHECK ("origin_kind" IN ('OPENING','EXTERNAL_DEPOSIT','LEGACY','UNKNOWN')),
 CONSTRAINT "allocation_ledger_entries_event_owner_fk" FOREIGN KEY ("event_id","user_id") REFERENCES "allocation_ledger_events"("id","user_id"),
 CONSTRAINT "allocation_ledger_entries_bucket_owner_fk" FOREIGN KEY ("bucket_id","user_id") REFERENCES "allocation_buckets"("id","user_id"),
 CONSTRAINT "allocation_ledger_entries_origin_fk" FOREIGN KEY ("origin_event_id","user_id") REFERENCES "allocation_ledger_events"("id","user_id")
);
CREATE INDEX "allocation_ledger_entries_user_bucket_idx" ON "allocation_ledger_entries" ("user_id","bucket_id");
CREATE INDEX "allocation_ledger_entries_event_idx" ON "allocation_ledger_entries" ("event_id");
