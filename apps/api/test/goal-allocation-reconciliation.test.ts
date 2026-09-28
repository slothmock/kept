import { randomUUID } from "node:crypto";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  connectDatabase,
  type DatabaseConnection,
} from "../src/db/client.js";
import { migrateDatabase } from "../src/db/migrate.js";
import { KeptPersistenceService } from "../src/persistence/index.js";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://kept:kept_local_dev@127.0.0.1:55432/kept_test";

const WALLET_ADDRESS =
  "0x0000000000000000000000000000000000000001";

let connection: DatabaseConnection;
let service: KeptPersistenceService;
let vaultShares = 0n;



function createAllocationService() {
  return new KeptPersistenceService(connection.db, {
    chainId: 143n,
    reader: {
      readShares: async () =>
        vaultShares,

      convertToAssets: async (
        shares: bigint,
      ) =>
        shares,
    },
  });
}

async function createUser(label: string) {
  return service.createUser({
    privyUserId: `privy:${label}:${randomUUID()}`,
    displayName: label,
  });
}

async function createGoal(
  userId: string,
  name = "Test goal",
) {
  return service.createGoal({
    userId,
    idempotencyKey: randomUUID(),
    name,
    targetAmountAtomic: "1000000000",
    targetDate: null,
  });
}

async function allocate(
  allocationService: KeptPersistenceService,
  userId: string,
  goalId: string,
  shares: bigint,
) {
  return allocationService.allocateGoalShares({
    userId,
    goalId,
    walletAddress: WALLET_ADDRESS,
    shareDeltaAtomic: shares.toString(),
    reason: "manual",
    idempotencyKey: randomUUID(),
  });
}

beforeAll(async () => {
  connection = connectDatabase(TEST_DATABASE_URL);
  service = new KeptPersistenceService(connection.db);
});

beforeEach(async () => {
  vaultShares = 0n;

  await connection.pool.query(
    `
      TRUNCATE TABLE
        goal_share_allocations,
        idempotency_records,
        user_commitments,
        savings_goals,
        wallets,
        users
      CASCADE
    `,
  );
});

afterAll(async () => {
  await (connection as DatabaseConnection | undefined)?.close();
});

describe.sequential(
  "goal allocation reconciliation against live vault shares",
  () => {
    it("leaves allocations unchanged while live vault shares still cover them", async () => {
      const owner = await createUser("covered-allocation");
      const goal = await createGoal(owner.id);

      vaultShares = 500n;

      const allocationService = createAllocationService();

      await allocate(
        allocationService,
        owner.id,
        goal.id,
        300n,
      );

      const allocation =
        await allocationService.getGoalAllocation(
          owner.id,
          goal.id,
          WALLET_ADDRESS,
        );

      expect(allocation).toMatchObject({
        allocatedSharesAtomic: "300",
        totalVaultSharesAtomic: "500",
        totalAllocatedSharesAtomic: "300",
        unallocatedSharesAtomic: "200",
      });

      const rows = await connection.pool.query<{
        count: string;
      }>(
        `
          SELECT count(*)::text AS count
          FROM goal_share_allocations
          WHERE goal_id = $1
        `,
        [goal.id],
      );

      expect(rows.rows[0]?.count).toBe("1");
    });

    it("reconciles all goal allocations to zero after all vault shares are withdrawn", async () => {
      const owner = await createUser("full-withdrawal");
      const goal = await createGoal(owner.id);

      vaultShares = 500n;

      const allocationService = createAllocationService();

      await allocate(
        allocationService,
        owner.id,
        goal.id,
        300n,
      );

      vaultShares = 0n;

      const reconciled =
        await allocationService.getGoalAllocation(
          owner.id,
          goal.id,
          WALLET_ADDRESS,
        );

      expect(reconciled).toMatchObject({
        allocatedSharesAtomic: "0",
        totalVaultSharesAtomic: "0",
        totalAllocatedSharesAtomic: "0",
        unallocatedSharesAtomic: "0",
      });

      const history = await connection.pool.query<{
        delta: string;
        reason: string;
      }>(
        `
          SELECT
            share_delta_atomic::text AS delta,
            reason
          FROM goal_share_allocations
          WHERE goal_id = $1
          ORDER BY created_at, id
        `,
        [goal.id],
      );

      expect(history.rows).toEqual([
        {
          delta: "300",
          reason: "manual",
        },
        {
          delta: "-300",
          reason: "vault_balance_reconciliation",
        },
      ]);
    });

    it("uses unallocated shares before reducing goal allocations", async () => {
      const owner = await createUser("unallocated-withdrawal");
      const goal = await createGoal(owner.id);

      vaultShares = 500n;

      const allocationService = createAllocationService();

      await allocate(
        allocationService,
        owner.id,
        goal.id,
        300n,
      );

      /*
       * 500 total shares
       * 300 allocated
       * 200 unallocated
       *
       * Removing 150 leaves 350, which still covers all
       * 300 allocated shares.
       */
      vaultShares = 350n;

      const allocation =
        await allocationService.getGoalAllocation(
          owner.id,
          goal.id,
          WALLET_ADDRESS,
        );

      expect(allocation).toMatchObject({
        allocatedSharesAtomic: "300",
        totalVaultSharesAtomic: "350",
        totalAllocatedSharesAtomic: "300",
        unallocatedSharesAtomic: "50",
      });

      const rows = await connection.pool.query<{
        count: string;
      }>(
        `
          SELECT count(*)::text AS count
          FROM goal_share_allocations
          WHERE goal_id = $1
        `,
        [goal.id],
      );

      expect(rows.rows[0]?.count).toBe("1");
    });

    it("reduces a goal allocation when remaining vault shares fall below the allocated amount", async () => {
      const owner = await createUser("allocated-withdrawal");
      const goal = await createGoal(owner.id);

      vaultShares = 500n;

      const allocationService = createAllocationService();

      await allocate(
        allocationService,
        owner.id,
        goal.id,
        300n,
      );

      /*
       * 200 shares remain.
       *
       * The previous 200 unallocated shares have been exhausted,
       * so the goal itself must fall from 300 -> 200.
       */
      vaultShares = 200n;

      const allocation =
        await allocationService.getGoalAllocation(
          owner.id,
          goal.id,
          WALLET_ADDRESS,
        );

      expect(allocation).toMatchObject({
        allocatedSharesAtomic: "200",
        totalVaultSharesAtomic: "200",
        totalAllocatedSharesAtomic: "200",
        unallocatedSharesAtomic: "0",
      });

      const history = await connection.pool.query<{
        delta: string;
        reason: string;
      }>(
        `
          SELECT
            share_delta_atomic::text AS delta,
            reason
          FROM goal_share_allocations
          WHERE goal_id = $1
          ORDER BY created_at, id
        `,
        [goal.id],
      );

      expect(history.rows).toEqual([
        {
          delta: "300",
          reason: "manual",
        },
        {
          delta: "-100",
          reason: "vault_balance_reconciliation",
        },
      ]);
    });

    it("reconciles multiple funded goals proportionally", async () => {
      const owner = await createUser("pro-rata-withdrawal");

      const firstGoal = await createGoal(
        owner.id,
        "Laptop",
      );

      const secondGoal = await createGoal(
        owner.id,
        "Holiday",
      );

      vaultShares = 500n;

      const allocationService = createAllocationService();

      await allocate(
        allocationService,
        owner.id,
        firstGoal.id,
        200n,
      );

      await allocate(
        allocationService,
        owner.id,
        secondGoal.id,
        100n,
      );

      /*
       * Existing allocation ratio:
       *
       * Laptop  = 200 / 300
       * Holiday = 100 / 300
       *
       * Only 150 shares remain, so the expected result is:
       *
       * Laptop  = 100
       * Holiday = 50
       */
      vaultShares = 150n;

      const first =
        await allocationService.getGoalAllocation(
          owner.id,
          firstGoal.id,
          WALLET_ADDRESS,
        );

      const second =
        await allocationService.getGoalAllocation(
          owner.id,
          secondGoal.id,
          WALLET_ADDRESS,
        );

      expect(first).toMatchObject({
        allocatedSharesAtomic: "100",
        totalVaultSharesAtomic: "150",
        totalAllocatedSharesAtomic: "150",
        unallocatedSharesAtomic: "0",
      });

      expect(second).toMatchObject({
        allocatedSharesAtomic: "50",
        totalVaultSharesAtomic: "150",
        totalAllocatedSharesAtomic: "150",
        unallocatedSharesAtomic: "0",
      });

      const rows = await connection.pool.query<{
        goal_id: string;
        allocated: string;
      }>(
        `
          SELECT
            goal_id,
            sum(share_delta_atomic)::text AS allocated
          FROM goal_share_allocations
          WHERE user_id = $1
          GROUP BY goal_id
          ORDER BY goal_id
        `,
        [owner.id],
      );

      const byGoal = new Map(
        rows.rows.map((row) => [
          row.goal_id,
          row.allocated,
        ]),
      );

      expect(byGoal.get(firstGoal.id)).toBe("100");
      expect(byGoal.get(secondGoal.id)).toBe("50");
    });

    it("distributes integer rounding without breaking the aggregate invariant", async () => {
      const owner = await createUser("rounding");

      const firstGoal = await createGoal(owner.id, "A");
      const secondGoal = await createGoal(owner.id, "B");
      const thirdGoal = await createGoal(owner.id, "C");

      vaultShares = 3n;

      const allocationService = createAllocationService();

      await allocate(
        allocationService,
        owner.id,
        firstGoal.id,
        1n,
      );

      await allocate(
        allocationService,
        owner.id,
        secondGoal.id,
        1n,
      );

      await allocate(
        allocationService,
        owner.id,
        thirdGoal.id,
        1n,
      );

      vaultShares = 2n;

      const allocations = await Promise.all([
        allocationService.getGoalAllocation(
          owner.id,
          firstGoal.id,
          WALLET_ADDRESS,
        ),
        allocationService.getGoalAllocation(
          owner.id,
          secondGoal.id,
          WALLET_ADDRESS,
        ),
        allocationService.getGoalAllocation(
          owner.id,
          thirdGoal.id,
          WALLET_ADDRESS,
        ),
      ]);

      const total = allocations.reduce(
        (sum, allocation) =>
          sum +
          BigInt(
            allocation?.allocatedSharesAtomic ?? "0",
          ),
        0n,
      );

      expect(total).toBe(2n);

      for (const allocation of allocations) {
        expect(allocation).not.toBeNull();

        expect(
          BigInt(
            allocation?.allocatedSharesAtomic ?? "0",
          ),
        ).toBeGreaterThanOrEqual(0n);

        expect(
          BigInt(
            allocation?.unallocatedSharesAtomic ?? "0",
          ),
        ).toBeGreaterThanOrEqual(0n);

        expect(
          BigInt(
            allocation?.totalAllocatedSharesAtomic ?? "0",
          ),
        ).toBeLessThanOrEqual(
          BigInt(
            allocation?.totalVaultSharesAtomic ?? "0",
          ),
        );
      }
    });

    it("does not append duplicate reconciliation entries on repeated reads", async () => {
      const owner = await createUser(
        "reconciliation-idempotency",
      );

      const goal = await createGoal(owner.id);

      vaultShares = 300n;

      const allocationService = createAllocationService();

      await allocate(
        allocationService,
        owner.id,
        goal.id,
        300n,
      );

      vaultShares = 100n;

      await allocationService.getGoalAllocation(
        owner.id,
        goal.id,
        WALLET_ADDRESS,
      );

      await allocationService.getGoalAllocation(
        owner.id,
        goal.id,
        WALLET_ADDRESS,
      );

      const history = await connection.pool.query<{
        delta: string;
        reason: string;
      }>(
        `
          SELECT
            share_delta_atomic::text AS delta,
            reason
          FROM goal_share_allocations
          WHERE goal_id = $1
          ORDER BY created_at, id
        `,
        [goal.id],
      );

      expect(history.rows).toEqual([
        {
          delta: "300",
          reason: "manual",
        },
        {
          delta: "-200",
          reason: "vault_balance_reconciliation",
        },
      ]);
    });

    it("allows new allocation after reconciliation against a lower vault balance", async () => {
      const owner = await createUser(
        "post-reconciliation",
      );

      const goal = await createGoal(owner.id);

      vaultShares = 300n;

      const allocationService = createAllocationService();

      await allocate(
        allocationService,
        owner.id,
        goal.id,
        300n,
      );

      /*
       * Simulate an external withdrawal.
       */
      vaultShares = 100n;

      await allocationService.getGoalAllocation(
        owner.id,
        goal.id,
        WALLET_ADDRESS,
      );

      /*
       * User later deposits another 50 shares.
       */
      vaultShares = 150n;

      const allocation = await allocate(
        allocationService,
        owner.id,
        goal.id,
        50n,
      );

      expect(allocation).toMatchObject({
        allocatedSharesAtomic: "150",
        totalVaultSharesAtomic: "150",
        totalAllocatedSharesAtomic: "150",
        unallocatedSharesAtomic: "0",
      });

      const history = await connection.pool.query<{
        delta: string;
        reason: string;
      }>(
        `
          SELECT
            share_delta_atomic::text AS delta,
            reason
          FROM goal_share_allocations
          WHERE goal_id = $1
          ORDER BY created_at, id
        `,
        [goal.id],
      );

      expect(history.rows).toEqual([
        {
          delta: "300",
          reason: "manual",
        },
        {
          delta: "-200",
          reason: "vault_balance_reconciliation",
        },
        {
          delta: "50",
          reason: "manual",
        },
      ]);
    });

    it("maintains a non-negative unallocated balance after reconciliation", async () => {
      const owner = await createUser(
        "non-negative-invariant",
      );

      const firstGoal = await createGoal(
        owner.id,
        "First",
      );

      const secondGoal = await createGoal(
        owner.id,
        "Second",
      );

      vaultShares = 1_000n;

      const allocationService = createAllocationService();

      await allocate(
        allocationService,
        owner.id,
        firstGoal.id,
        600n,
      );

      await allocate(
        allocationService,
        owner.id,
        secondGoal.id,
        300n,
      );

      vaultShares = 137n;

      const first =
        await allocationService.getGoalAllocation(
          owner.id,
          firstGoal.id,
          WALLET_ADDRESS,
        );

      const second =
        await allocationService.getGoalAllocation(
          owner.id,
          secondGoal.id,
          WALLET_ADDRESS,
        );

      expect(first).not.toBeNull();
      expect(second).not.toBeNull();

      expect(
        BigInt(first!.unallocatedSharesAtomic),
      ).toBeGreaterThanOrEqual(0n);

      expect(
        BigInt(second!.unallocatedSharesAtomic),
      ).toBeGreaterThanOrEqual(0n);

      expect(
        BigInt(first!.totalAllocatedSharesAtomic),
      ).toBeLessThanOrEqual(
        BigInt(first!.totalVaultSharesAtomic),
      );

      expect(
        BigInt(second!.totalAllocatedSharesAtomic),
      ).toBeLessThanOrEqual(
        BigInt(second!.totalVaultSharesAtomic),
      );
    });
  },
);