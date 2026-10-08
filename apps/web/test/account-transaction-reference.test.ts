import { describe, expect, it } from "vitest";

import {
  transactionSupportReference,
} from "../src/features/account/transaction-reference.js";

describe("transaction support reference", () => {
  it("shows the MoonPay reference for fiat withdrawals", () => {
    expect(transactionSupportReference({
      id: "transaction-1",
      type: "fiat_withdrawal",
      status: "pending",
      amountAtomic: "25000000",
      asset: "USDC",
      description: "Withdrawn to bank",
      goalId: null,
      chainId: null,
      transactionHash: null,
      externalReference: "moonpay-sell-123",
      createdAt: "2026-10-04T00:00:00.000Z",
    })).toBe("MoonPay reference: moonpay-sell-123");
  });

  it("does not surface unrelated or missing references", () => {
    expect(transactionSupportReference({
      id: "transaction-2",
      type: "savings_deposit",
      status: "completed",
      amountAtomic: "1000000",
      asset: "USDC",
      description: "Added to savings",
      goalId: null,
      chainId: "143",
      transactionHash: "0xabc",
      externalReference: "0xabc",
      createdAt: "2026-10-04T00:00:00.000Z",
    })).toBeNull();
  });
});
