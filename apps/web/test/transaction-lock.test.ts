import { describe, expect, it } from "vitest";

import {
  createTransactionLock,
  getVaultTransactionCoordinator,
} from "../src/lib/transaction-lock.js";

describe("createTransactionLock", () => {
  it("rejects a second operation while the first is pending", async () => {
    const lock = createTransactionLock();
    let releaseFirst!: () => void;
    let calls = 0;

    const first = lock.run(async () => {
      calls += 1;
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
    });
    const second = lock.run(async () => {
      calls += 1;
    });

    expect(lock.pending).toBe(true);
    expect(await second).toBe(false);
    expect(calls).toBe(1);

    releaseFirst();
    expect(await first).toBe(true);
    expect(lock.pending).toBe(false);
  });

  it("releases the lock when an operation fails", async () => {
    const lock = createTransactionLock();

    await expect(lock.run(async () => {
      throw new Error("reverted");
    })).rejects.toThrow("reverted");

    expect(lock.pending).toBe(false);
    expect(await lock.run(async () => undefined)).toBe(true);
  });

  it("shares pending transaction state across consumers", async () => {
    const firstConsumer = getVaultTransactionCoordinator();
    const secondConsumer = getVaultTransactionCoordinator();
    let releaseFirst!: () => void;

    const first = firstConsumer.run("deposit", async () => {
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
    });

    expect(secondConsumer.pendingKind).toBe("deposit");
    expect(await secondConsumer.run("withdraw", async () => undefined)).toBe(false);
    releaseFirst();
    await first;
    expect(secondConsumer.pendingKind).toBe(null);
  });
});
