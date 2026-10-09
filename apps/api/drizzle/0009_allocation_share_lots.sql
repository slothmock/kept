-- Additive lineage tracking; no balance initialization in this migration.
CREATE TABLE "allocation_share_lots" (
 "id" uuid PRIMARY KEY NOT NULL,
 "user_id" uuid NOT NULL REFERENCES "users"("id"),
 "bucket_id" uuid NOT NULL,
 "origin_event_id" uuid NOT NULL,
 "origin_kind" text NOT NULL,
 "shares_atomic" numeric(78,0) NOT NULL,
 "ever_goal_allocated" boolean NOT NULL DEFAULT false,
 "first_goal_id" uuid,
 "created_at" timestamptz NOT NULL,
 CONSTRAINT "allocation_share_lots_amount_positive" CHECK ("shares_atomic" > 0),
 CONSTRAINT "allocation_share_lots_origin_kind" CHECK ("origin_kind" IN ('OPENING','EXTERNAL_DEPOSIT','LEGACY','UNKNOWN')),
 CONSTRAINT "allocation_share_lots_bucket_owner_fk" FOREIGN KEY ("bucket_id","user_id") REFERENCES "allocation_buckets"("id","user_id"),
 CONSTRAINT "allocation_share_lots_origin_owner_fk" FOREIGN KEY ("origin_event_id","user_id") REFERENCES "allocation_ledger_events"("id","user_id"),
 CONSTRAINT "allocation_share_lots_first_goal_owner_fk" FOREIGN KEY ("first_goal_id","user_id") REFERENCES "savings_goals"("id","user_id")
);
CREATE INDEX "allocation_share_lots_owner_bucket_idx" ON "allocation_share_lots"("user_id","bucket_id","created_at","id");
