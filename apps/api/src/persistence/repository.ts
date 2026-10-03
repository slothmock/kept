import { and, asc, desc, eq, gt, lte, sql } from "drizzle-orm";

import type { CommitmentState, JsonValue } from "../domain/commitments/index.js";
import type { KeptDatabase } from "../db/client.js";
import {
  accountTransactions,
  commitmentDefinitions,
  goalShareAllocations,
  idempotencyRecords,
  moonPayOfframpOrders,
  savingsGoals,
  userCommitments,
  users,
  wallets,
} from "../db/schema.js";

export type PersistenceExecutor = Pick<KeptDatabase, "delete" | "insert" | "select" | "update">;

export interface CommitmentRecord {
  readonly id: string;
  readonly userId: string;
  readonly savingsGoalId: string;
  readonly definitionId: string;
  readonly definitionCode: string;
  readonly definitionVersion: number;
  readonly parameters: Record<string, JsonValue>;
  readonly epochStart: Date;
  readonly epochEnd: Date;
  readonly verificationDeadline: Date;
  readonly state: CommitmentState;
  readonly stateVersion: number;
  readonly activatedAt: Date | null;
  readonly finalizedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly opaqueSettlementRef: Uint8Array | null;
}

export class KeptRepository {
  constructor(private readonly db: PersistenceExecutor) { }

  async createUser(input: {
    readonly id: string;
    readonly privyUserId: string;
    readonly displayName: string | null;
    readonly now: Date;
  }) {
    const [inserted] = await this.db
      .insert(users)
      .values({
        id: input.id,
        privyUserId: input.privyUserId,
        displayName: input.displayName,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoNothing({ target: users.privyUserId })
      .returning();

    return inserted ?? this.findUserByPrivyId(input.privyUserId);
  }

  async findUser(id: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return user ?? null;
  }

  async findUserByPrivyId(privyUserId: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.privyUserId, privyUserId))
      .limit(1);
    return user ?? null;
  }

  async createWallet(input: typeof wallets.$inferInsert) {
    const [wallet] = await this.db.insert(wallets).values(input).returning();
    return wallet;
  }

  async updateWallet(input: {
    readonly id: string;
    readonly walletKind: string;
    readonly isPrimary: boolean;
  }) {
    const [wallet] = await this.db
      .update(wallets)
      .set({
        walletKind: input.walletKind,
        isPrimary: input.isPrimary,
      })
      .where(eq(wallets.id, input.id))
      .returning();

    return wallet ?? null;
  }

  async findWalletForOwner(userId: string, id: string) {
    const [wallet] = await this.db
      .select()
      .from(wallets)
      .where(and(eq(wallets.id, id), eq(wallets.userId, userId)))
      .limit(1);
    return wallet ?? null;
  }

  async findPrimaryWalletForOwnerOnChain(userId: string, chainId: bigint) {
    const [wallet] = await this.db
      .select()
      .from(wallets)
      .where(and(
        eq(wallets.userId, userId),
        eq(wallets.chainId, chainId),
        eq(wallets.isPrimary, true),
      ))
      .limit(1);
    return wallet ?? null;
  }

  async findWalletByChainAddress(chainId: bigint, address: string) {
    const [wallet] = await this.db
      .select()
      .from(wallets)
      .where(and(
        eq(wallets.chainId, chainId),
        sql`lower(${wallets.address}) = lower(${address})`,
      ))
      .limit(1);
    return wallet ?? null;
  }

  async createGoal(input: typeof savingsGoals.$inferInsert) {
    const [goal] = await this.db.insert(savingsGoals).values(input).returning();
    return goal;
  }

  async findGoalForOwner(userId: string, id: string) {
    const [goal] = await this.db
      .select()
      .from(savingsGoals)
      .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId)))
      .limit(1);
    return goal ?? null;
  }

  async listGoalsForOwner(userId: string) {
    return this.db
      .select()
      .from(savingsGoals)
      .where(eq(savingsGoals.userId, userId))
      .orderBy(desc(savingsGoals.createdAt), desc(savingsGoals.id));
  }

  async createAccountTransaction(
    input:
      typeof accountTransactions.$inferInsert,
  ) {
    const [transaction] =
      await this.db
        .insert(accountTransactions)
        .values(input)
        .returning();

    return transaction;
  }

  async listAccountTransactionsForOwner(
    userId: string,
    limit = 100,
  ) {
    return this.db
      .select()
      .from(accountTransactions)
      .where(
        eq(
          accountTransactions.userId,
          userId,
        ),
      )
      .orderBy(
        desc(
          accountTransactions.createdAt,
        ),
        desc(
          accountTransactions.id,
        ),
      )
      .limit(limit);
  }

  async createMoonPayOfframpOrder(
    input: typeof moonPayOfframpOrders.$inferInsert,
  ) {
    const [order] = await this.db
      .insert(moonPayOfframpOrders)
      .values(input)
      .returning();

    return order;
  }

  async findMoonPayOfframpOrderForOwner(
    userId: string,
    id: string,
  ) {
    const [order] = await this.db
      .select()
      .from(moonPayOfframpOrders)
      .where(and(
        eq(moonPayOfframpOrders.id, id),
        eq(moonPayOfframpOrders.userId, userId),
      ))
      .limit(1);

    return order ?? null;
  }

  async updateMoonPayOfframpOrderFromWebhook(input: {
    readonly id: string;
    readonly moonPayTransactionId: string;
    readonly baseCurrencyCode: string;
    readonly depositWalletAddress: string;
    readonly depositWalletTag: string | null;
    readonly now: Date;
  }) {
    const [order] = await this.db
      .update(moonPayOfframpOrders)
      .set({
        moonPayTransactionId: input.moonPayTransactionId,
        baseCurrencyCode: input.baseCurrencyCode,
        depositWalletAddress: input.depositWalletAddress,
        depositWalletTag: input.depositWalletTag,
        status: "AWAITING_DEPOSIT",
        updatedAt: input.now,
      })
      .where(eq(moonPayOfframpOrders.id, input.id))
      .returning();

    return order ?? null;
  }

  async lockGoalsForOwner(userId: string): Promise<void> {
    await this.db
      .select({ id: savingsGoals.id })
      .from(savingsGoals)
      .where(eq(savingsGoals.userId, userId))
      .for("update");
  }

  async appendGoalShareAllocation(input: typeof goalShareAllocations.$inferInsert) {
    const [allocation] = await this.db.insert(goalShareAllocations).values(input).returning();
    return allocation;
  }

  async getGoalAllocatedShares(userId: string, goalId: string): Promise<string> {
    const [result] = await this.db
      .select({
        allocatedSharesAtomic: sql<string>`coalesce(sum(${goalShareAllocations.shareDeltaAtomic}), 0)`,
      })
      .from(goalShareAllocations)
      .where(and(eq(goalShareAllocations.userId, userId), eq(goalShareAllocations.goalId, goalId)));
    return result?.allocatedSharesAtomic ?? "0";
  }

  async getTotalAllocatedShares(userId: string): Promise<string> {
    const [result] = await this.db
      .select({
        allocatedSharesAtomic: sql<string>`coalesce(sum(${goalShareAllocations.shareDeltaAtomic}), 0)`,
      })
      .from(goalShareAllocations)
      .where(eq(goalShareAllocations.userId, userId));
    return result?.allocatedSharesAtomic ?? "0";
  }

  async getAllocationTotals(userId: string, goalId: string): Promise<{
    readonly goalAllocatedSharesAtomic: string;
    readonly totalAllocatedSharesAtomic: string;
  }> {
    const [result] = await this.db
      .select({
        goalAllocatedSharesAtomic: sql<string>`coalesce(sum(${goalShareAllocations.shareDeltaAtomic}) filter (where ${goalShareAllocations.goalId} = ${goalId}), 0)`,
        totalAllocatedSharesAtomic: sql<string>`coalesce(sum(${goalShareAllocations.shareDeltaAtomic}), 0)`,
      })
      .from(goalShareAllocations)
      .where(eq(goalShareAllocations.userId, userId));
    return result ?? {
      goalAllocatedSharesAtomic: "0",
      totalAllocatedSharesAtomic: "0",
    };
  }

  async getGoalAllocatedSharesAt(
    userId: string,
    goalId: string,
    at: Date,
  ): Promise<string> {
    const [result] = await this.db
      .select({
        allocatedSharesAtomic:
          sql<string>`
          coalesce(
            sum(${goalShareAllocations.shareDeltaAtomic}),
            0
          )
        `,
      })
      .from(goalShareAllocations)
      .where(
        and(
          eq(
            goalShareAllocations.userId,
            userId,
          ),
          eq(
            goalShareAllocations.goalId,
            goalId,
          ),
          lte(
            goalShareAllocations.createdAt,
            at,
          ),
        ),
      );

    return (
      result?.allocatedSharesAtomic
      ?? "0"
    );
  }

  async listGoalAllocationDeltasForPeriod(
    userId: string,
    goalId: string,
    startAt: Date,
    endAt: Date,
  ): Promise<
    readonly {
      readonly id: string;
      readonly shareDeltaAtomic: string;
      readonly createdAt: Date;
    }[]
  > {
    return this.db
      .select({
        id:
          goalShareAllocations.id,

        shareDeltaAtomic:
          goalShareAllocations.shareDeltaAtomic,

        createdAt:
          goalShareAllocations.createdAt,
      })
      .from(goalShareAllocations)
      .where(
        and(
          eq(
            goalShareAllocations.userId,
            userId,
          ),
          eq(
            goalShareAllocations.goalId,
            goalId,
          ),
          gt(
            goalShareAllocations.createdAt,
            startAt,
          ),
          lte(
            goalShareAllocations.createdAt,
            endAt,
          ),
        ),
      )
      .orderBy(
        asc(
          goalShareAllocations.createdAt,
        ),
        asc(
          goalShareAllocations.id,
        ),
      );
  }

  async listPositiveGoalAllocationsForOwner(
    userId: string,
  ): Promise<readonly {
    goalId: string;
    allocatedSharesAtomic: string;
  }[]> {
    return this.db
      .select({
        goalId: goalShareAllocations.goalId,
        allocatedSharesAtomic:
          sql<string>`sum(${goalShareAllocations.shareDeltaAtomic})`,
      })
      .from(goalShareAllocations)
      .where(eq(goalShareAllocations.userId, userId))
      .groupBy(goalShareAllocations.goalId)
      .having(
        sql`sum(${goalShareAllocations.shareDeltaAtomic}) > 0`,
      )
      .orderBy(goalShareAllocations.goalId);
  }

  async findActiveDefinition(code: string, version: number) {
    const [definition] = await this.db
      .select()
      .from(commitmentDefinitions)
      .where(
        and(
          eq(commitmentDefinitions.code, code),
          eq(commitmentDefinitions.version, version),
          eq(commitmentDefinitions.active, true),
        ),
      )
      .limit(1);
    return definition ?? null;
  }

  async createCommitment(input: typeof userCommitments.$inferInsert) {
    await this.db.insert(userCommitments).values(input);
    return this.findCommitmentForOwner(input.userId, input.id);
  }

  async findCommitmentForOwner(userId: string, id: string): Promise<CommitmentRecord | null> {
    const [record] = await this.db
      .select({
        id: userCommitments.id,
        userId: userCommitments.userId,
        savingsGoalId: userCommitments.savingsGoalId,
        definitionId: userCommitments.definitionId,
        definitionCode: commitmentDefinitions.code,
        definitionVersion: commitmentDefinitions.version,
        parameters: userCommitments.parameters,
        epochStart: userCommitments.epochStart,
        epochEnd: userCommitments.epochEnd,
        verificationDeadline: userCommitments.verificationDeadline,
        state: userCommitments.state,
        stateVersion: userCommitments.stateVersion,
        activatedAt: userCommitments.activatedAt,
        finalizedAt: userCommitments.finalizedAt,
        createdAt: userCommitments.createdAt,
        updatedAt: userCommitments.updatedAt,
        opaqueSettlementRef: userCommitments.opaqueSettlementRef,
      })
      .from(userCommitments)
      .innerJoin(
        commitmentDefinitions,
        eq(userCommitments.definitionId, commitmentDefinitions.id),
      )
      .where(and(eq(userCommitments.id, id), eq(userCommitments.userId, userId)))
      .limit(1);

    return record ?? null;
  }

  async listCommitmentsForOwner(userId: string): Promise<readonly CommitmentRecord[]> {
    return this.db
      .select({
        id: userCommitments.id,
        userId: userCommitments.userId,
        savingsGoalId: userCommitments.savingsGoalId,
        definitionId: userCommitments.definitionId,
        definitionCode: commitmentDefinitions.code,
        definitionVersion: commitmentDefinitions.version,
        parameters: userCommitments.parameters,
        epochStart: userCommitments.epochStart,
        epochEnd: userCommitments.epochEnd,
        verificationDeadline: userCommitments.verificationDeadline,
        state: userCommitments.state,
        stateVersion: userCommitments.stateVersion,
        activatedAt: userCommitments.activatedAt,
        finalizedAt: userCommitments.finalizedAt,
        createdAt: userCommitments.createdAt,
        updatedAt: userCommitments.updatedAt,
        opaqueSettlementRef: userCommitments.opaqueSettlementRef,
      })
      .from(userCommitments)
      .innerJoin(
        commitmentDefinitions,
        eq(userCommitments.definitionId, commitmentDefinitions.id),
      )
      .where(eq(userCommitments.userId, userId))
      .orderBy(desc(userCommitments.createdAt), desc(userCommitments.id));
  }

  async listDueActiveCommitments(
    now: Date,
    limit = 50,
  ): Promise<readonly CommitmentRecord[]> {
    return this.db
      .select({
        id: userCommitments.id,
        userId: userCommitments.userId,
        savingsGoalId: userCommitments.savingsGoalId,
        definitionId: userCommitments.definitionId,
        definitionCode: commitmentDefinitions.code,
        definitionVersion: commitmentDefinitions.version,
        parameters: userCommitments.parameters,
        epochStart: userCommitments.epochStart,
        epochEnd: userCommitments.epochEnd,
        verificationDeadline: userCommitments.verificationDeadline,
        state: userCommitments.state,
        stateVersion: userCommitments.stateVersion,
        activatedAt: userCommitments.activatedAt,
        finalizedAt: userCommitments.finalizedAt,
        createdAt: userCommitments.createdAt,
        updatedAt: userCommitments.updatedAt,
        opaqueSettlementRef: userCommitments.opaqueSettlementRef,
      })
      .from(userCommitments)
      .innerJoin(
        commitmentDefinitions,
        eq(
          userCommitments.definitionId,
          commitmentDefinitions.id,
        ),
      )
      .where(
        and(
          eq(userCommitments.state, "ACTIVE"),
          eq(
            commitmentDefinitions.code,
            "WEEKLY_SAVINGS_V1",
          ),
          lte(
            userCommitments.epochEnd,
            now,
          ),
        ),
      )
      .orderBy(
        userCommitments.epochEnd,
        userCommitments.id,
      )
      .limit(limit);
  }

  async listCommitmentsForGoal(
    userId: string,
    goalId: string,
  ) {
    return this.db
      .select()
      .from(userCommitments)
      .where(
        and(
          eq(userCommitments.userId, userId),
          eq(userCommitments.savingsGoalId, goalId),
        ),
      );
  }

  async findCommitmentForOwnerForUpdate(
    userId: string,
    id: string,
  ): Promise<CommitmentRecord | null> {
    const [record] = await this.db
      .select({
        id: userCommitments.id,
        userId: userCommitments.userId,
        savingsGoalId: userCommitments.savingsGoalId,
        definitionId: userCommitments.definitionId,
        definitionCode: commitmentDefinitions.code,
        definitionVersion: commitmentDefinitions.version,
        parameters: userCommitments.parameters,
        epochStart: userCommitments.epochStart,
        epochEnd: userCommitments.epochEnd,
        verificationDeadline: userCommitments.verificationDeadline,
        state: userCommitments.state,
        stateVersion: userCommitments.stateVersion,
        activatedAt: userCommitments.activatedAt,
        finalizedAt: userCommitments.finalizedAt,
        createdAt: userCommitments.createdAt,
        updatedAt: userCommitments.updatedAt,
        opaqueSettlementRef: userCommitments.opaqueSettlementRef,
      })
      .from(userCommitments)
      .innerJoin(
        commitmentDefinitions,
        eq(userCommitments.definitionId, commitmentDefinitions.id),
      )
      .where(and(eq(userCommitments.id, id), eq(userCommitments.userId, userId)))
      .limit(1)
      .for("update");

    return record ?? null;
  }

  async updateCommitmentState(input: {
    readonly userId: string;
    readonly id: string;
    readonly expectedState: CommitmentState;
    readonly expectedVersion: number;
    readonly targetState: CommitmentState;
    readonly opaqueSettlementRef: Uint8Array | null;
    readonly activatedAt: Date | null;
    readonly finalizedAt: Date | null;
    readonly updatedAt: Date;
  }): Promise<boolean> {
    const updated = await this.db
      .update(userCommitments)
      .set({
        state: input.targetState,
        stateVersion: sql`${userCommitments.stateVersion} + 1`,
        opaqueSettlementRef: input.opaqueSettlementRef
          ? Buffer.from(input.opaqueSettlementRef)
          : null,
        activatedAt: input.activatedAt,
        finalizedAt: input.finalizedAt,
        updatedAt: input.updatedAt,
      })
      .where(
        and(
          eq(userCommitments.id, input.id),
          eq(userCommitments.userId, input.userId),
          eq(userCommitments.state, input.expectedState),
          eq(userCommitments.stateVersion, input.expectedVersion),
        ),
      )
      .returning({ id: userCommitments.id });

    return updated.length === 1;
  }

  async findCommitment(id: string): Promise<CommitmentRecord | null> {
    const [record] = await this.db
      .select({
        id: userCommitments.id,
        userId: userCommitments.userId,
        savingsGoalId: userCommitments.savingsGoalId,
        definitionId: userCommitments.definitionId,
        definitionCode: commitmentDefinitions.code,
        definitionVersion: commitmentDefinitions.version,
        parameters: userCommitments.parameters,
        epochStart: userCommitments.epochStart,
        epochEnd: userCommitments.epochEnd,
        verificationDeadline: userCommitments.verificationDeadline,
        state: userCommitments.state,
        stateVersion: userCommitments.stateVersion,
        activatedAt: userCommitments.activatedAt,
        finalizedAt: userCommitments.finalizedAt,
        createdAt: userCommitments.createdAt,
        updatedAt: userCommitments.updatedAt,
        opaqueSettlementRef: userCommitments.opaqueSettlementRef,
      })
      .from(userCommitments)
      .innerJoin(
        commitmentDefinitions,
        eq(userCommitments.definitionId, commitmentDefinitions.id),
      )
      .where(eq(userCommitments.id, id))
      .limit(1);

    return record ?? null;
  }

  async archiveGoal(input: {
    readonly userId: string;
    readonly goalId: string;
    readonly updatedAt: Date;
  }) {
    const [updated] = await this.db
      .update(savingsGoals)
      .set({
        status: "ARCHIVED",
        updatedAt: input.updatedAt,
      })
      .where(
        and(
          eq(savingsGoals.id, input.goalId),
          eq(savingsGoals.userId, input.userId),
          eq(savingsGoals.status, "ACTIVE"),
        ),
      )
      .returning();

    return updated ?? null;
  }

  async updateCommitmentStateInternal(input: {
    readonly id: string;
    readonly expectedState: CommitmentState;
    readonly expectedVersion: number;
    readonly targetState: CommitmentState;
    readonly finalizedAt: Date;
    readonly updatedAt: Date;
  }): Promise<boolean> {
    const updated = await this.db
      .update(userCommitments)
      .set({
        state: input.targetState,
        stateVersion: sql`${userCommitments.stateVersion} + 1`,
        finalizedAt: input.finalizedAt,
        updatedAt: input.updatedAt,
      })
      .where(
        and(
          eq(userCommitments.id, input.id),
          eq(userCommitments.state, input.expectedState),
          eq(userCommitments.stateVersion, input.expectedVersion),
        ),
      )
      .returning({ id: userCommitments.id });

    return updated.length === 1;
  }

  async deleteExpiredIdempotency(
    userId: string,
    scope: string,
    idempotencyKey: string,
    now: Date,
  ): Promise<void> {
    await this.db
      .delete(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.userId, userId),
          eq(idempotencyRecords.scope, scope),
          eq(idempotencyRecords.idempotencyKey, idempotencyKey),
          lte(idempotencyRecords.expiresAt, now),
        ),
      );
  }

  async reserveIdempotency(input: typeof idempotencyRecords.$inferInsert): Promise<boolean> {
    const inserted = await this.db
      .insert(idempotencyRecords)
      .values(input)
      .onConflictDoNothing({
        target: [
          idempotencyRecords.userId,
          idempotencyRecords.scope,
          idempotencyRecords.idempotencyKey,
        ],
      })
      .returning({ id: idempotencyRecords.id });

    return inserted.length === 1;
  }

  async findIdempotency(userId: string, scope: string, idempotencyKey: string) {
    const [record] = await this.db
      .select()
      .from(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.userId, userId),
          eq(idempotencyRecords.scope, scope),
          eq(idempotencyRecords.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async completeIdempotency(id: string, responseBody: JsonValue): Promise<void> {
    await this.db
      .update(idempotencyRecords)
      .set({ responseStatus: 200, responseBody })
      .where(eq(idempotencyRecords.id, id));
  }
}
