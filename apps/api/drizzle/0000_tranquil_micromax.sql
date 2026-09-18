CREATE TYPE "public"."commitment_state" AS ENUM('DRAFT', 'ACTIVE', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."goal_status" AS ENUM('ACTIVE', 'COMPLETED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."verification_class" AS ENUM('ONCHAIN', 'EXTERNAL');--> statement-breakpoint
CREATE TABLE "commitment_definitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"version" integer NOT NULL,
	"category" text,
	"display_name" text,
	"verification_class" "verification_class" NOT NULL,
	"parameter_schema" jsonb NOT NULL,
	"verification_config" jsonb,
	"proof_adapter_key" text,
	"reward_weight_max" numeric(6, 5),
	"privacy_policy" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "commitment_definitions_code_version_unique" UNIQUE("code","version"),
	CONSTRAINT "commitment_definitions_version_positive" CHECK ("commitment_definitions"."version" > 0),
	CONSTRAINT "commitment_definitions_reward_weight_range" CHECK ("commitment_definitions"."reward_weight_max" IS NULL OR ("commitment_definitions"."reward_weight_max" >= 0 AND "commitment_definitions"."reward_weight_max" <= 1))
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_records_user_scope_key_unique" UNIQUE("user_id","scope","idempotency_key"),
	CONSTRAINT "idempotency_records_completed_together" CHECK (("idempotency_records"."response_status" IS NULL) = ("idempotency_records"."response_body" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "savings_goals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"target_amount_atomic" numeric(78, 0) NOT NULL,
	"target_asset" text DEFAULT 'USDC' NOT NULL,
	"target_date" date,
	"status" "goal_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "savings_goals_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "savings_goals_name_not_blank" CHECK (length(btrim("savings_goals"."name")) > 0),
	CONSTRAINT "savings_goals_target_nonnegative" CHECK ("savings_goals"."target_amount_atomic" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_commitments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"savings_goal_id" uuid NOT NULL,
	"definition_id" uuid NOT NULL,
	"parameters" jsonb NOT NULL,
	"epoch_start" timestamp with time zone NOT NULL,
	"epoch_end" timestamp with time zone NOT NULL,
	"verification_deadline" timestamp with time zone NOT NULL,
	"state" "commitment_state" DEFAULT 'DRAFT' NOT NULL,
	"state_version" integer DEFAULT 1 NOT NULL,
	"opaque_settlement_ref" "bytea",
	"activated_at" timestamp with time zone,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_commitments_opaque_settlement_ref_unique" UNIQUE("opaque_settlement_ref"),
	CONSTRAINT "user_commitments_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "user_commitments_state_version_positive" CHECK ("user_commitments"."state_version" > 0),
	CONSTRAINT "user_commitments_epoch_order" CHECK ("user_commitments"."epoch_end" > "user_commitments"."epoch_start"),
	CONSTRAINT "user_commitments_verification_deadline_order" CHECK ("user_commitments"."verification_deadline" >= "user_commitments"."epoch_end")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"privy_user_id" text NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "users_privy_user_id_unique" UNIQUE("privy_user_id")
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"privy_wallet_id" text,
	"wallet_kind" text NOT NULL,
	"chain_id" bigint,
	"address" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_commitments" ADD CONSTRAINT "user_commitments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_commitments" ADD CONSTRAINT "user_commitments_definition_id_commitment_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."commitment_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_commitments" ADD CONSTRAINT "user_commitments_goal_owner_fk" FOREIGN KEY ("savings_goal_id","user_id") REFERENCES "public"."savings_goals"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_chain_address_unique" ON "wallets" USING btree ("chain_id",lower("address"));--> statement-breakpoint
CREATE FUNCTION prevent_published_definition_mutation() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'published commitment definition versions cannot be deleted'
			USING ERRCODE = '23514';
	END IF;

	IF ROW(
		NEW.code,
		NEW.version,
		NEW.category,
		NEW.display_name,
		NEW.verification_class,
		NEW.parameter_schema,
		NEW.verification_config,
		NEW.proof_adapter_key,
		NEW.reward_weight_max,
		NEW.privacy_policy,
		NEW.created_at
	) IS DISTINCT FROM ROW(
		OLD.code,
		OLD.version,
		OLD.category,
		OLD.display_name,
		OLD.verification_class,
		OLD.parameter_schema,
		OLD.verification_config,
		OLD.proof_adapter_key,
		OLD.reward_weight_max,
		OLD.privacy_policy,
		OLD.created_at
	) THEN
		RAISE EXCEPTION 'published commitment definition versions are immutable'
			USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER commitment_definitions_immutable
	BEFORE UPDATE OR DELETE ON commitment_definitions
	FOR EACH ROW EXECUTE FUNCTION prevent_published_definition_mutation();--> statement-breakpoint
CREATE FUNCTION prevent_activated_commitment_identity_mutation() RETURNS trigger AS $$
BEGIN
	IF ROW(NEW.id, NEW.user_id, NEW.savings_goal_id)
		IS DISTINCT FROM ROW(OLD.id, OLD.user_id, OLD.savings_goal_id) THEN
		RAISE EXCEPTION 'commitment identity and ownership are immutable'
			USING ERRCODE = '23514';
	END IF;

	IF OLD.activated_at IS NOT NULL AND NEW.activated_at IS NULL THEN
		RAISE EXCEPTION 'commitment activation timestamp cannot be cleared'
			USING ERRCODE = '23514';
	END IF;

	IF (OLD.state <> 'DRAFT' OR NEW.state <> 'DRAFT' OR OLD.activated_at IS NOT NULL)
		AND ROW(
			NEW.definition_id,
			NEW.parameters,
			NEW.epoch_start,
			NEW.epoch_end,
			NEW.verification_deadline
		) IS DISTINCT FROM ROW(
			OLD.definition_id,
			OLD.parameters,
			OLD.epoch_start,
			OLD.epoch_end,
			OLD.verification_deadline
		) THEN
		RAISE EXCEPTION 'activated commitment identity and parameters are immutable'
			USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER user_commitments_activated_identity_immutable
	BEFORE UPDATE ON user_commitments
	FOR EACH ROW EXECUTE FUNCTION prevent_activated_commitment_identity_mutation();