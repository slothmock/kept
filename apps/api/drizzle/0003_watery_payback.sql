CREATE TYPE "public"."account_transaction_status" AS ENUM('PENDING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."account_transaction_type" AS ENUM('FIAT_FUNDING', 'CRYPTO_FUNDING', 'SAVINGS_DEPOSIT', 'SAVINGS_WITHDRAWAL', 'CRYPTO_WITHDRAWAL', 'REWARD');--> statement-breakpoint
ALTER TYPE "public"."commitment_state" ADD VALUE 'ARCHIVED';--> statement-breakpoint
CREATE TABLE "account_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid,
	"type" "account_transaction_type" NOT NULL,
	"status" "account_transaction_status" DEFAULT 'COMPLETED' NOT NULL,
	"amount_atomic" numeric(78, 0) NOT NULL,
	"asset" text DEFAULT 'USDC' NOT NULL,
	"description" text NOT NULL,
	"chain_id" bigint,
	"transaction_hash" text,
	"external_reference" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "account_transactions_amount_positive" CHECK ("account_transactions"."amount_atomic" > 0),
	CONSTRAINT "account_transactions_asset_not_blank" CHECK (length(btrim("account_transactions"."asset")) > 0),
	CONSTRAINT "account_transactions_description_not_blank" CHECK (length(btrim("account_transactions"."description")) > 0)
);
--> statement-breakpoint
ALTER TABLE "account_transactions" ADD CONSTRAINT "account_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_transactions" ADD CONSTRAINT "account_transactions_goal_owner_fk" FOREIGN KEY ("goal_id","user_id") REFERENCES "public"."savings_goals"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_transactions_user_created_idx" ON "account_transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "account_transactions_user_external_reference_unique" ON "account_transactions" USING btree ("user_id","external_reference") WHERE "account_transactions"."external_reference" IS NOT NULL;