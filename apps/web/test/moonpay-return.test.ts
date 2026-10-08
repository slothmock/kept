import { describe, expect, it } from "vitest";

import { consumeMoonPayReturnUrl } from "../src/features/withdrawals/moonpay-return.js";

describe("MoonPay return handling", () => {
  it("keeps only the Kept order reference and removes browser-supplied payout details", () => {
    expect(consumeMoonPayReturnUrl(
      "https://kept.example/dashboard?moonpayOrderId=order-1&transactionId=fake&depositWalletAddress=0xdeadbeef&baseCurrencyCode=eth&baseCurrencyAmount=999&tab=goals",
    )).toEqual({
      orderId: "order-1",
      cleanedPath: "/dashboard?tab=goals",
    });
  });

  it("does not create a return reference without a Kept order id", () => {
    expect(consumeMoonPayReturnUrl(
      "https://kept.example/dashboard?depositWalletAddress=0xdeadbeef",
    )).toBeNull();
  });
});
