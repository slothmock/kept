-- Record historical source-lot evidence at the instant of each transfer.
-- Additive and append-only: do not rewrite historical ledger events.
CREATE TABLE "allocation_transfer_lot_movements" (
  "id" uuid PRIMARY KEY NOT NULL,
  "event_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "source_bucket_id" uuid NOT NULL,
  "destination_bucket_id" uuid NOT NULL,
  "origin_event_id" uuid NOT NULL,
  "origin_kind" text NOT NULL,
  "shares_atomic" numeric(78,0) NOT NULL,
  "was_ever_goal_allocated" boolean NOT NULL,
  "created_at" timestamptz NOT NULL,
  CONSTRAINT "allocation_transfer_lot_movements_positive" CHECK ("shares_atomic" > 0),
  CONSTRAINT "allocation_transfer_lot_movements_origin" CHECK ("origin_kind" IN ('OPENING','EXTERNAL_DEPOSIT','LEGACY','UNKNOWN')),
  CONSTRAINT "allocation_transfer_lot_movements_distinct_buckets" CHECK ("source_bucket_id" <> "destination_bucket_id"),
  CONSTRAINT "allocation_transfer_lot_movements_event_owner_fk" FOREIGN KEY ("event_id","user_id") REFERENCES "allocation_ledger_events"("id","user_id"),
  CONSTRAINT "allocation_transfer_lot_movements_source_owner_fk" FOREIGN KEY ("source_bucket_id","user_id") REFERENCES "allocation_buckets"("id","user_id"),
  CONSTRAINT "allocation_transfer_lot_movements_dest_owner_fk" FOREIGN KEY ("destination_bucket_id","user_id") REFERENCES "allocation_buckets"("id","user_id"),
  CONSTRAINT "allocation_transfer_lot_movements_origin_owner_fk" FOREIGN KEY ("origin_event_id","user_id") REFERENCES "allocation_ledger_events"("id","user_id")
);
CREATE INDEX "allocation_transfer_lot_movements_owner_time_idx"
  ON "allocation_transfer_lot_movements"("user_id","created_at","event_id");
CREATE INDEX "allocation_transfer_lot_movements_event_idx"
  ON "allocation_transfer_lot_movements"("event_id");
