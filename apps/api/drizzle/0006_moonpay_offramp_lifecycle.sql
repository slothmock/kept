ALTER TYPE "public"."account_transaction_type" ADD VALUE IF NOT EXISTS 'FIAT_WITHDRAWAL';
--> statement-breakpoint
ALTER TABLE "moonpay_offramp_orders" ADD COLUMN "transfer_reference" text;
--> statement-breakpoint
ALTER TABLE "moonpay_offramp_orders" ADD COLUMN "funds_sent_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "moonpay_offramp_orders" DROP CONSTRAINT "moonpay_offramp_orders_status_valid";
--> statement-breakpoint
ALTER TABLE "moonpay_offramp_orders" ALTER COLUMN "status" SET DEFAULT 'PENDING_WIDGET';
--> statement-breakpoint
UPDATE "moonpay_offramp_orders" SET "status" = 'READY' WHERE "status" = 'AWAITING_DEPOSIT';
--> statement-breakpoint
ALTER TABLE "moonpay_offramp_orders" ADD CONSTRAINT "moonpay_offramp_orders_status_valid" CHECK ("status" IN ('PENDING_WIDGET', 'AWAITING_DEPOSIT_DETAILS', 'READY', 'FUNDS_SENT', 'COMPLETED', 'FAILED', 'CANCELLED'));
