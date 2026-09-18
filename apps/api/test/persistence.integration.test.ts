import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { connectDatabase, type DatabaseConnection } from "../src/db/client.js";
import { migrateDatabase } from "../src/db/migrate.js";
import {
  IdempotencyConflictError,
  KeptPersistenceService,
  NotFoundError,
  PersistenceValidationError,
} from "../src/persistence/index.js";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://kept:kept_local_dev@127.0.0.1:55432/kept_test";

let connection: DatabaseConnection;
let service: KeptPersistenceService;

async function resetEmptyDatabase() {
  const databaseName = decodeURIComponent(new URL(TEST_DATABASE_URL).pathname.slice(1));
  if (!databaseName.endsWith("_test")) {
    throw new Error("Refusing to reset a database whose name does not end in _test");
  }

  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  try {
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
  } finally {
    await pool.end();
  }
}

async function createUser(label: string) {
  return service.createUser({
    privyUserId: `privy:${label}:${randomUUID()}`,
    displayName: label,
  });
}

async function createGoal(userId: string, key = randomUUID()) {
  return service.createGoal({
    userId,
    idempotencyKey: key,
    name: "Private laptop goal",
    targetAmountAtomic: "1000000000",
    targetDate: "2027-01-31",
  });
}

async function createDraft(userId: string, goalId: string, key = randomUUID()) {
  return service.createCommitmentDraft({
    userId,
    idempotencyKey: key,
    goalId,
    definition: { code: "WEEKLY_SAVINGS_V1", version: 1 },
    parameters: { targetAmountAtomic: "25000000", periodDays: 7 },
    epochStart: "2026-09-07T00:00:00.000Z",
    epochEnd: "2026-09-14T00:00:00.000Z",
    verificationDeadline: "2026-09-15T00:00:00.000Z",
  });
}

async function waitForBlockedCommitmentQuery(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await connection.pool.query<{ blocked: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND query LIKE '%user_commitments%') AS blocked",
    );
    if (result.rows[0]?.blocked) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Activation did not reach the expected PostgreSQL lock wait");
}

beforeAll(async () => {
  await resetEmptyDatabase();
  await migrateDatabase(TEST_DATABASE_URL);
  connection = connectDatabase(TEST_DATABASE_URL);
  service = new KeptPersistenceService(connection.db);
});

beforeEach(async () => {
  await connection.pool.query(
    "TRUNCATE TABLE idempotency_records, user_commitments, savings_goals, wallets, users CASCADE",
  );
});

afterAll(async () => {
  await (connection as DatabaseConnection | undefined)?.close();
});

describe.sequential("PostgreSQL migrations and schema constraints", () => {
  it("applies all migrations to an empty database and seeds exactly two definitions", async () => {
    const tables = await connection.pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );
    const definitions = await connection.pool.query<{ code: string; version: number }>(
      "SELECT code, version FROM commitment_definitions ORDER BY code",
    );

    expect(tables.rows.map(({ table_name }) => table_name)).toEqual(
      expect.arrayContaining([
        "users",
        "wallets",
        "savings_goals",
        "commitment_definitions",
        "user_commitments",
        "idempotency_records",
      ]),
    );
    expect(definitions.rows).toEqual([
      { code: "ACTIVITY_COUNT_V1", version: 1 },
      { code: "WEEKLY_SAVINGS_V1", version: 1 },
    ]);
  });

  it("rejects invalid foreign-key references and invalid constrained values", async () => {
    await expect(
      connection.pool.query(
        "INSERT INTO wallets (id, user_id, wallet_kind, address, is_primary, created_at) VALUES ($1, $2, 'PRIVY_EMBEDDED_MONAD', '0xabc', true, now())",
        [randomUUID(), randomUUID()],
      ),
    ).rejects.toMatchObject({ code: "23503" });

    const user = await createUser("owner");
    await expect(
      connection.pool.query(
        "INSERT INTO savings_goals (id, user_id, name, target_amount_atomic, target_asset, status, created_at, updated_at) VALUES ($1, $2, 'bad', -1, 'USDC', 'ACTIVE', now(), now())",
        [randomUUID(), user.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    const goal = await createGoal(user.id);
    await expect(
      connection.pool.query(
        "INSERT INTO user_commitments (id, user_id, savings_goal_id, definition_id, parameters, epoch_start, epoch_end, verification_deadline, state, state_version, created_at, updated_at) VALUES ($1, $2, $3, $4, '{}', now(), now() + interval '7 days', now() + interval '8 days', 'DRAFT', 1, now(), now())",
        [randomUUID(), user.id, goal.id, randomUUID()],
      ),
    ).rejects.toMatchObject({ code: "23503" });

    const other = await createUser("other");
    const definition = await connection.pool.query<{ id: string }>(
      "SELECT id FROM commitment_definitions WHERE code = 'WEEKLY_SAVINGS_V1' AND version = 1",
    );
    await expect(
      connection.pool.query(
        "INSERT INTO user_commitments (id, user_id, savings_goal_id, definition_id, parameters, epoch_start, epoch_end, verification_deadline, state, state_version, created_at, updated_at) VALUES ($1, $2, $3, $4, '{\"targetAmountAtomic\":\"1\",\"periodDays\":7}', now(), now() + interval '7 days', now() + interval '8 days', 'DRAFT', 1, now(), now())",
        [randomUUID(), other.id, goal.id, definition.rows[0]?.id],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("contains private goal metadata but no authoritative savings ledger column", async () => {
    const columns = await connection.pool.query<{ column_name: string; table_name: string }>(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('users', 'wallets', 'savings_goals', 'commitment_definitions', 'user_commitments', 'idempotency_records') ORDER BY table_name, column_name",
    );
    const goalNames = columns.rows
      .filter(({ table_name }) => table_name === "savings_goals")
      .map(({ column_name }) => column_name);
    const allNames = columns.rows.map(({ column_name }) => column_name);

    expect(goalNames).toContain("target_amount_atomic");
    expect(allNames).not.toContain("balance");
    expect(allNames).not.toContain("balance_atomic");
    expect(allNames).not.toContain("principal");
    expect(allNames).not.toContain("vault_shares");
  });

  it("prevents deletion of a published commitment definition", async () => {
    const client = await connection.pool.connect();
    try {
      await client.query("BEGIN");
      await expect(
        client.query(
          "DELETE FROM commitment_definitions WHERE code = 'ACTIVITY_COUNT_V1' AND version = 1",
        ),
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});

describe.sequential("private users, wallet references, and goals", () => {
  it("creates and retrieves a user by internal identity", async () => {
    const created = await createUser("Jordan");

    await expect(service.getUser(created.id)).resolves.toMatchObject({
      id: created.id,
      displayName: "Jordan",
      privyUserId: created.privyUserId,
    });
  });

  it("keeps wallet references scoped to their owning user", async () => {
    const owner = await createUser("owner");
    const other = await createUser("other");
    const wallet = await service.createWallet({
      userId: owner.id,
      privyWalletId: "privy-wallet-reference",
      walletKind: "PRIVY_EMBEDDED_MONAD",
      chainId: "143",
      address: "0x0000000000000000000000000000000000000001",
      isPrimary: true,
    });

    await expect(service.getWallet(owner.id, wallet.id)).resolves.toMatchObject({
      userId: owner.id,
      address: "0x0000000000000000000000000000000000000001",
    });
    await expect(service.getWallet(other.id, wallet.id)).resolves.toBeNull();
  });

  it("creates and retrieves private goal metadata only for its owner", async () => {
    const owner = await createUser("owner");
    const other = await createUser("other");
    const goal = await createGoal(owner.id);

    await expect(service.getGoal(owner.id, goal.id)).resolves.toMatchObject({
      id: goal.id,
      userId: owner.id,
      name: "Private laptop goal",
      targetAmountAtomic: "1000000000",
      targetAsset: "USDC",
      targetDate: "2027-01-31",
      status: "ACTIVE",
    });
    await expect(service.getGoal(other.id, goal.id)).resolves.toBeNull();
    expect(goal).not.toHaveProperty("balance");
    expect(goal).not.toHaveProperty("principal");
    expect(goal).not.toHaveProperty("vaultShares");
  });

  it("lists only the requesting user's private goals in newest-first order", async () => {
    const owner = await createUser("owner");
    const other = await createUser("other");
    const first = await createGoal(owner.id);
    const second = await createGoal(owner.id);
    await createGoal(other.id);

    await expect(service.listGoals(owner.id)).resolves.toEqual([second, first]);
    await expect(service.listGoals(other.id)).resolves.toHaveLength(1);
  });
});

describe.sequential("commitment persistence and lifecycle", () => {
  it("persists an owner-scoped draft referencing the immutable catalogue version", async () => {
    const owner = await createUser("owner");
    const other = await createUser("other");
    const goal = await createGoal(owner.id);
    const draft = await createDraft(owner.id, goal.id);

    expect(draft).toMatchObject({
      userId: owner.id,
      savingsGoalId: goal.id,
      definition: { code: "WEEKLY_SAVINGS_V1", version: 1 },
      state: "DRAFT",
      stateVersion: 1,
    });
    await expect(service.getCommitment(owner.id, draft.id)).resolves.toEqual(draft);
    await expect(service.getCommitment(other.id, draft.id)).resolves.toBeNull();
    await expect(createDraft(other.id, goal.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lists only the requesting user's commitments in newest-first order", async () => {
    const owner = await createUser("owner");
    const other = await createUser("other");
    const goal = await createGoal(owner.id);
    const otherGoal = await createGoal(other.id);
    const first = await createDraft(owner.id, goal.id);
    const second = await createDraft(owner.id, goal.id);
    await createDraft(other.id, otherGoal.id);

    await expect(service.listCommitments(owner.id)).resolves.toEqual([second, first]);
    await expect(service.listCommitments(other.id)).resolves.toHaveLength(1);
  });

  it("activates through the domain lifecycle and persists the incremented version", async () => {
    const owner = await createUser("owner");
    const goal = await createGoal(owner.id);
    const draft = await createDraft(owner.id, goal.id);
    const active = await service.activateCommitment({
      userId: owner.id,
      commitmentId: draft.id,
      expectedVersion: 1,
      idempotencyKey: randomUUID(),
    });

    expect(active).toMatchObject({ state: "ACTIVE", stateVersion: 2 });
    expect(active.activatedAt).not.toBeNull();
    await expect(service.getCommitment(owner.id, draft.id)).resolves.toEqual(active);
  });

  it("cancels an active commitment without touching financial state", async () => {
    const owner = await createUser("owner");
    const goal = await createGoal(owner.id);
    const draft = await createDraft(owner.id, goal.id);
    const active = await service.activateCommitment({
      userId: owner.id,
      commitmentId: draft.id,
      expectedVersion: 1,
      idempotencyKey: randomUUID(),
    });

    const cancelled = await service.cancelCommitment({
      userId: owner.id,
      commitmentId: draft.id,
      expectedVersion: active.stateVersion,
      idempotencyKey: randomUUID(),
    });

    expect(cancelled).toMatchObject({ state: "CANCELLED", stateVersion: 3 });
    expect(cancelled.finalizedAt).not.toBeNull();
  });

  it("rejects a commitment window that contradicts the catalogue period", async () => {
    const owner = await createUser("owner");
    const goal = await createGoal(owner.id);

    await expect(
      service.createCommitmentDraft({
        userId: owner.id,
        idempotencyKey: randomUUID(),
        goalId: goal.id,
        definition: { code: "WEEKLY_SAVINGS_V1", version: 1 },
        parameters: { targetAmountAtomic: "25000000", periodDays: 7 },
        epochStart: "2026-09-07T00:00:00.000Z",
        epochEnd: "2026-09-13T00:00:00.000Z",
        verificationDeadline: "2026-09-15T00:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(PersistenceValidationError);
  });

  it("revalidates definition activity and parameters during activation", async () => {
    const owner = await createUser("owner");
    const goal = await createGoal(owner.id);
    const inactiveDraft = await createDraft(owner.id, goal.id);

    await connection.pool.query(
      "UPDATE commitment_definitions SET active = false WHERE code = 'WEEKLY_SAVINGS_V1' AND version = 1",
    );
    try {
      await expect(
        service.activateCommitment({
          userId: owner.id,
          commitmentId: inactiveDraft.id,
          expectedVersion: 1,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toBeInstanceOf(PersistenceValidationError);
    } finally {
      await connection.pool.query(
        "UPDATE commitment_definitions SET active = true WHERE code = 'WEEKLY_SAVINGS_V1' AND version = 1",
      );
    }

    const invalidDraft = await createDraft(owner.id, goal.id);
    await connection.pool.query(
      "UPDATE user_commitments SET parameters = '{\"targetAmountAtomic\":\"0\",\"periodDays\":7}' WHERE id = $1",
      [invalidDraft.id],
    );
    await expect(
      service.activateCommitment({
        userId: owner.id,
        commitmentId: invalidDraft.id,
        expectedVersion: 1,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(PersistenceValidationError);
  });

  it("validates and activates against one locked commitment snapshot", async () => {
    const owner = await createUser("owner");
    const goal = await createGoal(owner.id);
    const draft = await createDraft(owner.id, goal.id);
    const mutator = await connection.pool.connect();

    try {
      await mutator.query("BEGIN");
      await mutator.query(
        "UPDATE user_commitments SET parameters = '{\"targetAmountAtomic\":\"0\",\"periodDays\":7}' WHERE id = $1",
        [draft.id],
      );
      const activation = service.activateCommitment({
        userId: owner.id,
        commitmentId: draft.id,
        expectedVersion: 1,
        idempotencyKey: randomUUID(),
      });

      await waitForBlockedCommitmentQuery();
      await mutator.query("COMMIT");
      await expect(activation).rejects.toBeInstanceOf(PersistenceValidationError);
    } finally {
      await mutator.query("ROLLBACK");
      mutator.release();
    }
  });

  it("does not let another user activate an owner's commitment", async () => {
    const owner = await createUser("owner");
    const other = await createUser("other");
    const goal = await createGoal(owner.id);
    const draft = await createDraft(owner.id, goal.id);

    await expect(
      service.activateCommitment({
        userId: other.id,
        commitmentId: draft.id,
        expectedVersion: 1,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.getCommitment(owner.id, draft.id)).resolves.toMatchObject({
      state: "DRAFT",
      stateVersion: 1,
    });
  });

  it("rejects stale expected versions without overwriting persisted state", async () => {
    const owner = await createUser("owner");
    const goal = await createGoal(owner.id);
    const draft = await createDraft(owner.id, goal.id);
    await service.activateCommitment({
      userId: owner.id,
      commitmentId: draft.id,
      expectedVersion: 1,
      idempotencyKey: randomUUID(),
    });

    await expect(
      service.activateCommitment({
        userId: owner.id,
        commitmentId: draft.id,
        expectedVersion: 1,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ name: "StaleCommitmentVersionError" });
    await expect(service.getCommitment(owner.id, draft.id)).resolves.toMatchObject({
      state: "ACTIVE",
      stateVersion: 2,
    });
  });

  it("allows only one of two concurrent updates to win", async () => {
    const owner = await createUser("owner");
    const goal = await createGoal(owner.id);
    const draft = await createDraft(owner.id, goal.id);
    const attempts = await Promise.allSettled([
      service.activateCommitment({
        userId: owner.id,
        commitmentId: draft.id,
        expectedVersion: 1,
        idempotencyKey: randomUUID(),
      }),
      service.activateCommitment({
        userId: owner.id,
        commitmentId: draft.id,
        expectedVersion: 1,
        idempotencyKey: randomUUID(),
      }),
    ]);

    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(1);
    await expect(service.getCommitment(owner.id, draft.id)).resolves.toMatchObject({
      state: "ACTIVE",
      stateVersion: 2,
    });
  });

  it("prevents definition identity or parameters from changing after activation", async () => {
    const owner = await createUser("owner");
    const other = await createUser("other");
    const goal = await createGoal(owner.id);
    const otherGoal = await createGoal(other.id);
    const draft = await createDraft(owner.id, goal.id);
    await service.activateCommitment({
      userId: owner.id,
      commitmentId: draft.id,
      expectedVersion: 1,
      idempotencyKey: randomUUID(),
    });
    const activityDefinition = await connection.pool.query<{ id: string }>(
      "SELECT id FROM commitment_definitions WHERE code = 'ACTIVITY_COUNT_V1' AND version = 1",
    );

    await expect(
      connection.pool.query(
        "UPDATE user_commitments SET definition_id = $1 WHERE id = $2",
        [activityDefinition.rows[0]?.id, draft.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      connection.pool.query(
        "UPDATE user_commitments SET parameters = '{\"targetAmountAtomic\":\"99999999\",\"periodDays\":7}' WHERE id = $1",
        [draft.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      connection.pool.query(
        "UPDATE commitment_definitions SET code = 'WEEKLY_SAVINGS_RENAMED' WHERE code = 'WEEKLY_SAVINGS_V1' AND version = 1",
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      connection.pool.query(
        "UPDATE user_commitments SET user_id = $1, savings_goal_id = $2 WHERE id = $3",
        [other.id, otherGoal.id, draft.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
});

describe.sequential("idempotent write commands", () => {
  it("returns the original goal result on retry without creating a duplicate", async () => {
    const owner = await createUser("owner");
    const idempotencyKey = randomUUID();
    const first = await createGoal(owner.id, idempotencyKey);
    const retried = await createGoal(owner.id, idempotencyKey);
    const count = await connection.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM savings_goals WHERE user_id = $1",
      [owner.id],
    );

    expect(retried).toEqual(first);
    expect(count.rows[0]?.count).toBe("1");
  });

  it("returns the original activation result when the same command is retried", async () => {
    const owner = await createUser("owner");
    const goal = await createGoal(owner.id);
    const draft = await createDraft(owner.id, goal.id);
    const idempotencyKey = randomUUID();
    const input = {
      userId: owner.id,
      commitmentId: draft.id,
      expectedVersion: 1,
      idempotencyKey,
    };

    const first = await service.activateCommitment(input);
    const retried = await service.activateCommitment(input);

    expect(retried).toEqual(first);
    await expect(service.getCommitment(owner.id, draft.id)).resolves.toMatchObject({
      stateVersion: 2,
    });
  });

  it("coalesces concurrent retries without duplicating a goal", async () => {
    const owner = await createUser("owner");
    const idempotencyKey = randomUUID();
    const [first, second] = await Promise.all([
      createGoal(owner.id, idempotencyKey),
      createGoal(owner.id, idempotencyKey),
    ]);
    const count = await connection.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM savings_goals WHERE user_id = $1",
      [owner.id],
    );

    expect(second).toEqual(first);
    expect(count.rows[0]?.count).toBe("1");
  });

  it("rejects reuse of an idempotency key for a different request", async () => {
    const owner = await createUser("owner");
    const idempotencyKey = randomUUID();
    await createGoal(owner.id, idempotencyKey);

    await expect(
      service.createGoal({
        userId: owner.id,
        idempotencyKey,
        name: "Different request",
        targetAmountAtomic: "500000000",
        targetDate: null,
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it("allows an expired idempotency key to start a new command", async () => {
    const owner = await createUser("owner");
    const idempotencyKey = randomUUID();
    const first = await createGoal(owner.id, idempotencyKey);
    await connection.pool.query(
      "UPDATE idempotency_records SET expires_at = now() - interval '1 second' WHERE user_id = $1 AND scope = 'goal:create' AND idempotency_key = $2",
      [owner.id, idempotencyKey],
    );

    const second = await service.createGoal({
      userId: owner.id,
      idempotencyKey,
      name: "Replacement after expiry",
      targetAmountAtomic: "500000000",
      targetDate: null,
    });

    expect(second.id).not.toBe(first.id);
  });
});
