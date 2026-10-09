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
    "FIAT_WITHDRAWAL",
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

export const waitlistSignups = pgTable("waitlist_signups", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

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
    transferAssetsAtomic: numeric("transfer_assets_atomic", { precision: 78, scale: 0 }),
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

export const allocationBuckets = pgTable(
  "allocation_buckets",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id),
    bucketKind: text("bucket_kind").notNull(),
    goalId: uuid("goal_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("allocation_buckets_id_user_unique").on(table.id, table.userId),
    foreignKey({
      columns: [table.goalId, table.userId],
      foreignColumns: [savingsGoals.id, savingsGoals.userId],
      name: "allocation_buckets_goal_owner_fk",
    }),
    uniqueIndex("allocation_unassigned_unique").on(table.userId)
      .where(sql`${table.bucketKind} = 'UNASSIGNED'`),
    uniqueIndex("allocation_goal_unique").on(table.userId, table.goalId)
      .where(sql`${table.bucketKind} = 'GOAL'`),
    check("allocation_buckets_kind_check", sql`(${table.bucketKind} = 'UNASSIGNED' AND ${table.goalId} IS NULL) OR (${table.bucketKind} = 'GOAL' AND ${table.goalId} IS NOT NULL)`),
  ],
);

export const allocationLedgerEvents = pgTable(
  "allocation_ledger_events",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id),
    eventKind: text("event_kind").notNull(),
    idempotencyKey: text("idempotency_key"),
    transactionHash: text("transaction_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("allocation_ledger_events_id_user_unique").on(table.id, table.userId),
    uniqueIndex("allocation_ledger_event_idempotency_unique").on(table.userId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    index("allocation_ledger_events_user_created_idx").on(table.userId, table.createdAt),
    check("allocation_ledger_events_kind_check", sql`${table.eventKind} IN ('OPENING','TRANSFER','VAULT_CREDIT','VAULT_DEBIT','RECONCILIATION_CREDIT','RECONCILIATION_DEBIT')`),
  ],
);

export const allocationDepositClaims = pgTable(
  "allocation_deposit_claims",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id),
    ledgerEventId: uuid("ledger_event_id"),
    chainId: bigint("chain_id", {mode:"bigint"}).notNull(),
    vaultAddress: text("vault_address").notNull(),
    transactionHash: text("transaction_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    sharesAtomic: numeric("shares_atomic",{precision:78,scale:0}).notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at",{withTimezone:true}).notNull(),
  },
  (table) => [
    foreignKey({columns:[table.ledgerEventId,table.userId],foreignColumns:[allocationLedgerEvents.id,allocationLedgerEvents.userId],name:"allocation_deposit_claims_event_owner_fk"}),
    uniqueIndex("allocation_deposit_claims_log_unique").on(table.chainId,sql`lower(${table.vaultAddress})`,sql`lower(${table.transactionHash})`,table.logIndex),
    index("allocation_deposit_claims_user_idx").on(table.userId,table.createdAt),
    check("allocation_deposit_claims_shares_positive",sql`${table.sharesAtomic} > 0`),
    check("allocation_deposit_claims_status_valid",sql`${table.status} IN ('CREDITED','ALREADY_REFLECTED')`),
    check("allocation_deposit_claims_credit_consistency",sql`(${table.status} = 'CREDITED' AND ${table.ledgerEventId} IS NOT NULL) OR (${table.status} = 'ALREADY_REFLECTED' AND ${table.ledgerEventId} IS NULL)`),
  ],
);

export const allocationLedgerEntries = pgTable(
  "allocation_ledger_entries",
  {
    id: uuid("id").primaryKey(),
    eventId: uuid("event_id").notNull(),
    userId: uuid("user_id").notNull(),
    bucketId: uuid("bucket_id").notNull(),
    shareDeltaAtomic: numeric("share_delta_atomic", { precision: 78, scale: 0 }).notNull(),
    originEventId: uuid("origin_event_id"),
    originKind: text("origin_kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.eventId, table.userId],
      foreignColumns: [allocationLedgerEvents.id, allocationLedgerEvents.userId],
      name: "allocation_ledger_entries_event_owner_fk",
    }),
    foreignKey({
      columns: [table.bucketId, table.userId],
      foreignColumns: [allocationBuckets.id, allocationBuckets.userId],
      name: "allocation_ledger_entries_bucket_owner_fk",
    }),
    foreignKey({
      columns: [table.originEventId, table.userId],
      foreignColumns: [allocationLedgerEvents.id, allocationLedgerEvents.userId],
      name: "allocation_ledger_entries_origin_fk",
    }),
    index("allocation_ledger_entries_user_bucket_idx").on(table.userId, table.bucketId),
    index("allocation_ledger_entries_event_idx").on(table.eventId),
    check("allocation_ledger_entries_delta_check", sql`${table.shareDeltaAtomic} <> 0`),
    check("allocation_ledger_entries_origin_check", sql`${table.originKind} IN ('OPENING','EXTERNAL_DEPOSIT','LEGACY','UNKNOWN')`),
  ],
);

export const allocationShareLots = pgTable(
  "allocation_share_lots",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id),
    bucketId: uuid("bucket_id").notNull(),
    originEventId: uuid("origin_event_id").notNull(),
    originKind: text("origin_kind").notNull(),
    sharesAtomic: numeric("shares_atomic", { precision: 78, scale: 0 }).notNull(),
    everGoalAllocated: boolean("ever_goal_allocated").notNull().default(false),
    firstGoalId: uuid("first_goal_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    foreignKey({columns: [table.bucketId, table.userId], foreignColumns: [allocationBuckets.id, allocationBuckets.userId], name: "allocation_share_lots_bucket_owner_fk"}),
    foreignKey({columns: [table.originEventId, table.userId], foreignColumns: [allocationLedgerEvents.id, allocationLedgerEvents.userId], name: "allocation_share_lots_origin_owner_fk"}),
    foreignKey({columns: [table.firstGoalId, table.userId], foreignColumns: [savingsGoals.id, savingsGoals.userId], name: "allocation_share_lots_first_goal_owner_fk"}),
    index("allocation_share_lots_owner_bucket_idx").on(table.userId,table.bucketId,table.createdAt,table.id),
    check("allocation_share_lots_amount_positive", sql`${table.sharesAtomic} > 0`),
    check("allocation_share_lots_origin_kind", sql`${table.originKind} IN ('OPENING','EXTERNAL_DEPOSIT','LEGACY','UNKNOWN')`),
  ],
);

export const allocationTransferLotMovements = pgTable(
  "allocation_transfer_lot_movements",
  {
    id: uuid("id").primaryKey(),
    eventId: uuid("event_id").notNull(),
    userId: uuid("user_id").notNull(),
    sourceBucketId: uuid("source_bucket_id").notNull(),
    destinationBucketId: uuid("destination_bucket_id").notNull(),
    originEventId: uuid("origin_event_id").notNull(),
    originKind: text("origin_kind").notNull(),
    sharesAtomic: numeric("shares_atomic", {precision: 78, scale: 0}).notNull(),
    wasEverGoalAllocated: boolean("was_ever_goal_allocated").notNull(),
    createdAt: timestamp("created_at", {withTimezone: true}).notNull(),
  },
  (table) => [
    foreignKey({columns: [table.eventId, table.userId], foreignColumns: [allocationLedgerEvents.id, allocationLedgerEvents.userId], name: "allocation_transfer_lot_movements_event_owner_fk"}),
    foreignKey({columns: [table.sourceBucketId, table.userId], foreignColumns: [allocationBuckets.id, allocationBuckets.userId], name: "allocation_transfer_lot_movements_source_owner_fk"}),
    foreignKey({columns: [table.destinationBucketId, table.userId], foreignColumns: [allocationBuckets.id, allocationBuckets.userId], name: "allocation_transfer_lot_movements_dest_owner_fk"}),
    foreignKey({columns: [table.originEventId, table.userId], foreignColumns: [allocationLedgerEvents.id, allocationLedgerEvents.userId], name: "allocation_transfer_lot_movements_origin_owner_fk"}),
    index("allocation_transfer_lot_movements_owner_time_idx").on(table.userId,table.createdAt,table.eventId),
    index("allocation_transfer_lot_movements_event_idx").on(table.eventId),
    check("allocation_transfer_lot_movements_positive", sql`${table.sharesAtomic} > 0`),
    check("allocation_transfer_lot_movements_origin", sql`${table.originKind} IN ('OPENING','EXTERNAL_DEPOSIT','LEGACY','UNKNOWN')`),
    check("allocation_transfer_lot_movements_distinct_buckets", sql`${table.sourceBucketId} <> ${table.destinationBucketId}`),
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


export const moonPayOfframpOrders = pgTable(
  "moonpay_offramp_orders",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    amountAtomic: numeric("amount_atomic", { precision: 78, scale: 0 }).notNull(),
    baseCurrencyCode: text("base_currency_code").notNull().default("usdc_base"),
    moonPayTransactionId: text("moonpay_transaction_id"),
    depositWalletAddress: text("deposit_wallet_address"),
    depositWalletTag: text("deposit_wallet_tag"),
    transferReference: text("transfer_reference"),
    fundsSentAt: timestamp("funds_sent_at", { withTimezone: true }),
    status: text("status").notNull().default("PENDING_WIDGET"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("moonpay_offramp_orders_user_created_idx")
      .on(table.userId, table.createdAt),
    uniqueIndex("moonpay_offramp_orders_transaction_unique")
      .on(table.moonPayTransactionId)
      .where(sql`${table.moonPayTransactionId} IS NOT NULL`),
    check("moonpay_offramp_orders_amount_positive", sql`${table.amountAtomic} > 0`),
    check(
      "moonpay_offramp_orders_status_valid",
      sql`${table.status} IN ('PENDING_WIDGET', 'AWAITING_DEPOSIT_DETAILS', 'READY', 'FUNDS_SENT', 'COMPLETED', 'FAILED', 'CANCELLED')`,
    ),
  ],
);

export const vaultActivityEvents = pgTable(
  "vault_activity_events",
  {
    id: uuid("id").primaryKey(),
    chainId: bigint("chain_id", { mode: "bigint" }).notNull(),
    vaultAddress: text("vault_address").notNull(),
    accountAddress: text("account_address").notNull(),
    eventType: text("event_type").notNull(),
    assetsAtomic: numeric("assets_atomic", {
      precision: 78,
      scale: 0,
    }).notNull(),
    sharesAtomic: numeric("shares_atomic", { precision: 78, scale: 0 }),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    transactionHash: text("transaction_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("vault_activity_events_chain_vault_log_unique")
      .on(
        table.chainId,
        sql`lower(${table.vaultAddress})`,
        table.transactionHash,
        table.logIndex,
      ),
    index("vault_activity_events_account_idx")
      .on(
        table.chainId,
        sql`lower(${table.vaultAddress})`,
        sql`lower(${table.accountAddress})`,
      ),
    check(
      "vault_activity_events_type_valid",
      sql`${table.eventType} IN ('DEPOSIT', 'WITHDRAW')`,
    ),
    check(
      "vault_activity_events_assets_nonnegative",
      sql`${table.assetsAtomic} >= 0`,
    ),
    check(
      "vault_activity_events_shares_nonnegative",
      sql`${table.sharesAtomic} IS NULL OR ${table.sharesAtomic} >= 0`,
    ),
  ],
);

export const vaultActivityCursors = pgTable(
  "vault_activity_cursors",
  {
    id: uuid("id").primaryKey(),
    chainId: bigint("chain_id", { mode: "bigint" }).notNull(),
    vaultAddress: text("vault_address").notNull(),
    lastProcessedBlock: bigint("last_processed_block", { mode: "bigint" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("vault_activity_cursors_chain_vault_unique")
      .on(
        table.chainId,
        sql`lower(${table.vaultAddress})`,
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
  waitlistSignups,
  users,
  wallets,
  savingsGoals,
  goalShareAllocations,
  allocationBuckets,
  allocationLedgerEvents,
  allocationLedgerEntries,
  allocationShareLots,
  allocationTransferLotMovements,
  accountTransactions,
  moonPayOfframpOrders,
  vaultActivityEvents,
  vaultActivityCursors,
  commitmentDefinitions,
  userCommitments,
  idempotencyRecords,
};
