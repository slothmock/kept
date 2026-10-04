import { describe, expect, it, vi } from "vitest";

import {
  bankWithdrawalRefreshState,
  deliverBankWithdrawal,
} from "../src/features/withdrawal/bank-withdrawal-lifecycle.js";

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
