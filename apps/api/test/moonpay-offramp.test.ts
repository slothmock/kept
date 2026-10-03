import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  parseMoonPaySellWebhook,
  parseUsdcAmountToAtomic,
  verifyMoonPayWebhookSignature,
} from "../src/moonpay-offramp.js";

describe("MoonPay off-ramp helpers", () => {
  it("converts USDC amounts to atomic units", () => {
    expect(parseUsdcAmountToAtomic("20")).toBe("20000000");
    expect(parseUsdcAmountToAtomic("20.123456")).toBe("20123456");
  });

  it("verifies current MoonPay webhook signatures and rejects stale ones", () => {
    const rawBody = JSON.stringify({ type: "sell_transaction_created" });
    const timestamp = 1_791_067_200;
    const signature = createHmac("sha256", "webhook-key")
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");

    expect(verifyMoonPayWebhookSignature({
      rawBody,
      signatureHeader: `t=${timestamp},s=${signature}`,
      webhookKey: "webhook-key",
      now: new Date(timestamp * 1_000),
    })).toBe(true);

    expect(verifyMoonPayWebhookSignature({
      rawBody,
      signatureHeader: `t=${timestamp},s=${signature}`,
      webhookKey: "webhook-key",
      now: new Date((timestamp + 301) * 1_000),
    })).toBe(false);
  });

  it("extracts a verified Base USDC deposit wallet from sell events", () => {
    expect(parseMoonPaySellWebhook({
      type: "sell_transaction_created",
      data: {
        id: "moonpay-transaction-1",
        externalTransactionId: "order-1",
        baseCurrency: { code: "usdc_base" },
        depositWallet: {
          walletAddress: "0x00000000000000000000000000000000000000A1",
          walletAddressTag: null,
        },
      },
    })).toEqual({
      orderId: "order-1",
      moonPayTransactionId: "moonpay-transaction-1",
      baseCurrencyCode: "usdc_base",
      depositWalletAddress: "0x00000000000000000000000000000000000000A1",
      depositWalletTag: null,
    });
  });

  it("ignores non-Base or malformed sell events", () => {
    expect(parseMoonPaySellWebhook({
      type: "sell_transaction_created",
      data: {
        id: "moonpay-transaction-1",
        externalTransactionId: "order-1",
        baseCurrency: { code: "usdc" },
        depositWallet: {
          walletAddress: "0x00000000000000000000000000000000000000A1",
        },
      },
    })).toBeNull();
  });
});
