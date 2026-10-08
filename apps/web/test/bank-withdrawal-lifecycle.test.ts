import { describe, expect, it, vi } from "vitest";

import {
  bankWithdrawalRefreshState,
  createBankWithdrawalOrderStore,
  deliverBankWithdrawal,
} from "../src/features/withdrawals/bank-withdrawal-lifecycle.js";

describe("bank withdrawal lifecycle", () => {
  it("retries acknowledgement without executing the money movement twice", async () => {
    const pending = new Map<string, string>();
    const store = {
      load: (orderId: string) => pending.get(orderId) ?? null,
      save: (orderId: string, transferReference: string) => {
        pending.set(orderId, transferReference);
      },
      clear: (orderId: string) => {
        pending.delete(orderId);
      },
    };

    const execute = vi.fn(async () => ({ id: "aurora-execution-1" }));
    const acknowledge = vi.fn()
      .mockRejectedValueOnce(new Error("temporary API failure"))
      .mockResolvedValueOnce({ status: "funds_sent" });

    await expect(
      deliverBankWithdrawal({
        orderId: "moonpay-order-1",
        store,
        execute,
        acknowledge,
      }),
    ).rejects.toThrow("temporary API failure");

    expect(execute).toHaveBeenCalledTimes(1);
    expect(pending.get("moonpay-order-1")).toBe("aurora-execution-1");

    await expect(
      deliverBankWithdrawal({
        orderId: "moonpay-order-1",
        store,
        execute,
        acknowledge,
      }),
    ).resolves.toEqual({
      status: "funds_sent",
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(acknowledge).toHaveBeenCalledTimes(2);
    expect(pending.has("moonpay-order-1")).toBe(false);
  });

  it("persists the active order per wallet so a reload can resume polling", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    };

    const firstWallet = createBankWithdrawalOrderStore(
      storage,
      "0xAa00000000000000000000000000000000000001",
    );
    const secondWallet = createBankWithdrawalOrderStore(
      storage,
      "0xBb00000000000000000000000000000000000002",
    );

    firstWallet.save("moonpay-order-1");

    expect(firstWallet.load()).toBe("moonpay-order-1");
    expect(secondWallet.load()).toBeNull();

    const reloaded = createBankWithdrawalOrderStore(
      storage,
      "0xAA00000000000000000000000000000000000001",
    );

    expect(reloaded.load()).toBe("moonpay-order-1");

    reloaded.clear();
    expect(firstWallet.load()).toBeNull();
  });

  it("keeps funds-sent orders in processing until MoonPay reaches a terminal state", () => {
    expect(bankWithdrawalRefreshState("funds_sent")).toEqual({
      phase: "processing",
      settled: false,
      pollAfterMs: 10_000,
    });

    expect(bankWithdrawalRefreshState("completed")).toEqual({
      phase: "complete",
      settled: true,
      pollAfterMs: null,
    });

    expect(bankWithdrawalRefreshState("failed")).toEqual({
      phase: "failed",
      settled: true,
      pollAfterMs: null,
    });

    expect(bankWithdrawalRefreshState("cancelled")).toEqual({
      phase: "failed",
      settled: true,
      pollAfterMs: null,
    });
  });
});
