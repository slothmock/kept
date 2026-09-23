CREATE TABLE "goal_share_allocations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"share_delta_atomic" numeric(78, 0) NOT NULL,
	"reason" text NOT NULL,
	"transaction_hash" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "goal_share_allocations_delta_nonzero" CHECK ("goal_share_allocations"."share_delta_atomic" <> 0),
	CONSTRAINT "goal_share_allocations_reason_not_blank" CHECK (length(btrim("goal_share_allocations"."reason")) > 0)
);
--> statement-breakpoint
ALTER TABLE "goal_share_allocations" ADD CONSTRAINT "goal_share_allocations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_share_allocations" ADD CONSTRAINT "goal_share_allocations_goal_owner_fk" FOREIGN KEY ("goal_id","user_id") REFERENCES "public"."savings_goals"("id","user_id") ON DELETE no action ON UPDATE no action;