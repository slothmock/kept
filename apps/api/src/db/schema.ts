import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  foreignKey,
  integer,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  COMMITMENT_STATES,
  type JsonValue,
} from "../domain/commitments/index.js";

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const verificationClassEnum = pgEnum("verification_class", [
  "ONCHAIN",
  "EXTERNAL",
]);

export const commitmentStateEnum = pgEnum("commitment_state", COMMITMENT_STATES);

export const goalStatusEnum = pgEnum("goal_status", ["ACTIVE", "COMPLETED", "ARCHIVED"]);

export const accountTransactionTypeEnum = pgEnum(
  "account_transaction_type",
  [
    "FIAT_FUNDING",
    "CRYPTO_FUNDING",
    "SAVINGS_DEPOSIT",
    "SAVINGS_WITHDRAWAL",
    "CRYPTO_WITHDRAWAL",
    "REWARD",
  ],
);

export const accountTransactionStatusEnum = pgEnum(
  "account_transaction_status",
  [
    "PENDING",
    "COMPLETED",
    "FAILED",
  ],
);

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  privyUserId: text("privy_user_id").notNull().unique(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    privyWalletId: text("privy_wallet_id"),
    walletKind: text("wallet_kind").notNull(),
    chainId: bigint("chain_id", { mode: "bigint" }),
    address: text("address").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("wallets_chain_address_unique").on(table.chainId, sql`lower(${table.address})`),
    uniqueIndex("wallets_user_chain_primary_unique")
      .on(table.userId, table.chainId)
      .where(sql`${table.isPrimary} = true`),
  ],
);

export const savingsGoals = pgTable(
  "savings_goals",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    targetAmountAtomic: numeric("target_amount_atomic", { precision: 78, scale: 0 }).notNull(),
    targetAsset: text("target_asset").notNull().default("USDC"),
    targetDate: date("target_date"),
    status: goalStatusEnum("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("savings_goals_id_user_unique").on(table.id, table.userId),
    check("savings_goals_name_not_blank", sql`length(btrim(${table.name})) > 0`),
    check("savings_goals_target_nonnegative", sql`${table.targetAmountAtomic} >= 0`),
  ],
);

export const goalShareAllocations = pgTable(
  "goal_share_allocations",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id),
    goalId: uuid("goal_id").notNull(),
    shareDeltaAtomic: numeric("share_delta_atomic", { precision: 78, scale: 0 }).notNull(),
    reason: text("reason").notNull(),
    transactionHash: text("transaction_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.goalId, table.userId],
      foreignColumns: [savingsGoals.id, savingsGoals.userId],
      name: "goal_share_allocations_goal_owner_fk",
    }),
    check("goal_share_allocations_delta_nonzero", sql`${table.shareDeltaAtomic} <> 0`),
    check("goal_share_allocations_reason_not_blank", sql`length(btrim(${table.reason})) > 0`),
  ],
);

export const accountTransactions = pgTable(
  "account_transactions",
  {
    id: uuid("id").primaryKey(),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),

    /**
     * Optional because account-level operations such as
     * fiat funding or crypto withdrawals may have no goal.
     */
    goalId: uuid("goal_id"),

    type: accountTransactionTypeEnum("type").notNull(),

    status: accountTransactionStatusEnum("status")
      .notNull()
      .default("COMPLETED"),

    /**
     * Always positive.
     *
     * Direction is represented by `type`, not by making
     * deposits positive and withdrawals negative.
     *
     * USDC currently uses 6 decimals.
     */
    amountAtomic: numeric("amount_atomic", {
      precision: 78,
      scale: 0,
    }).notNull(),

    asset: text("asset")
      .notNull()
      .default("USDC"),

    description: text("description")
      .notNull(),

    /**
     * Monad/Solana/etc.
     *
     * Null for fiat-only events.
     */
    chainId: bigint("chain_id", {
      mode: "bigint",
    }),

    /**
     * On-chain transaction hash/signature where applicable.
     */
    transactionHash: text("transaction_hash"),

    /**
     * Provider/callback/deposit identifier.
     *
     * This gives us a clean idempotency boundary for things
     * such as fiat providers and bridge/on-ramp callbacks.
     */
    externalReference: text("external_reference"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [
        table.goalId,
        table.userId,
      ],
      foreignColumns: [
        savingsGoals.id,
        savingsGoals.userId,
      ],
      name: "account_transactions_goal_owner_fk",
    }),

    index("account_transactions_user_created_idx")
      .on(
        table.userId,
        table.createdAt,
      ),

    uniqueIndex(
      "account_transactions_user_external_reference_unique",
    )
      .on(
        table.userId,
        table.externalReference,
      )
      .where(
        sql`${table.externalReference} IS NOT NULL`,
      ),

    check(
      "account_transactions_amount_positive",
      sql`${table.amountAtomic} > 0`,
    ),

    check(
      "account_transactions_asset_not_blank",
      sql`length(btrim(${table.asset})) > 0`,
    ),

    check(
      "account_transactions_description_not_blank",
      sql`length(btrim(${table.description})) > 0`,
    ),
  ],
);

export const commitmentDefinitions = pgTable(
  "commitment_definitions",
  {
    id: uuid("id").primaryKey(),
    code: text("code").notNull(),
    version: integer("version").notNull(),
    category: text("category"),
    displayName: text("display_name"),
    verificationClass: verificationClassEnum("verification_class").notNull(),
    parameterSchema: jsonb("parameter_schema").$type<Record<string, JsonValue>>().notNull(),
    verificationConfig: jsonb("verification_config").$type<Record<string, JsonValue>>(),
    proofAdapterKey: text("proof_adapter_key"),
    rewardWeightMax: numeric("reward_weight_max", { precision: 6, scale: 5 }),
    privacyPolicy: jsonb("privacy_policy").$type<Record<string, JsonValue>>(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("commitment_definitions_code_version_unique").on(table.code, table.version),
    check("commitment_definitions_version_positive", sql`${table.version} > 0`),
    check(
      "commitment_definitions_reward_weight_range",
      sql`${table.rewardWeightMax} IS NULL OR (${table.rewardWeightMax} >= 0 AND ${table.rewardWeightMax} <= 1)`,
    ),
  ],
);

export const userCommitments = pgTable(
  "user_commitments",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    savingsGoalId: uuid("savings_goal_id").notNull(),
    definitionId: uuid("definition_id")
      .notNull()
      .references(() => commitmentDefinitions.id),
    parameters: jsonb("parameters").$type<Record<string, JsonValue>>().notNull(),
    epochStart: timestamp("epoch_start", { withTimezone: true }).notNull(),
    epochEnd: timestamp("epoch_end", { withTimezone: true }).notNull(),
    verificationDeadline: timestamp("verification_deadline", { withTimezone: true }).notNull(),
    state: commitmentStateEnum("state").notNull().default("DRAFT"),
    stateVersion: integer("state_version").notNull().default(1),
    opaqueSettlementRef: bytea("opaque_settlement_ref").unique(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("user_commitments_id_user_unique").on(table.id, table.userId),
    foreignKey({
      columns: [table.savingsGoalId, table.userId],
      foreignColumns: [savingsGoals.id, savingsGoals.userId],
      name: "user_commitments_goal_owner_fk",
    }),
    check("user_commitments_state_version_positive", sql`${table.stateVersion} > 0`),
    check("user_commitments_epoch_order", sql`${table.epochEnd} > ${table.epochStart}`),
    check(
      "user_commitments_verification_deadline_order",
      sql`${table.verificationDeadline} >= ${table.epochEnd}`,
    ),
  ],
);

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    scope: text("scope").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body").$type<JsonValue>(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("idempotency_records_user_scope_key_unique").on(
      table.userId,
      table.scope,
      table.idempotencyKey,
    ),
    check(
      "idempotency_records_completed_together",
      sql`(${table.responseStatus} IS NULL) = (${table.responseBody} IS NULL)`,
    ),
  ],
);

export const schema = {
  users,
  wallets,
  savingsGoals,
  goalShareAllocations,
  accountTransactions,
  commitmentDefinitions,
  userCommitments,
  idempotencyRecords,
};
