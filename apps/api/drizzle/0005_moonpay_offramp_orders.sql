CREATE TABLE "moonpay_offramp_orders" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL,
  "amount_atomic" numeric(78, 0) NOT NULL,
  "base_currency_code" text DEFAULT 'usdc_base' NOT NULL,
  "moonpay_transaction_id" text,
  "deposit_wallet_address" text,
  "deposit_wallet_tag" text,
  "status" text DEFAULT 'PENDING_WIDGET' NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "moonpay_offramp_orders_amount_positive" CHECK ("moonpay_offramp_orders"."amount_atomic" > 0),
  CONSTRAINT "moonpay_offramp_orders_status_valid" CHECK ("moonpay_offramp_orders"."status" IN ('PENDING_WIDGET', 'AWAITING_DEPOSIT', 'COMPLETED', 'FAILED'))
);
--> statement-breakpoint
ALTER TABLE "moonpay_offramp_orders" ADD CONSTRAINT "moonpay_offramp_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "moonpay_offramp_orders_user_created_idx" ON "moonpay_offramp_orders" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "moonpay_offramp_orders_transaction_unique" ON "moonpay_offramp_orders" USING btree ("moonpay_transaction_id") WHERE "moonpay_offramp_orders"."moonpay_transaction_id" IS NOT NULL;
