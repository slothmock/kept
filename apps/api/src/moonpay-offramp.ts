import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import { getAddress } from "viem";

import { PersistenceValidationError } from "./persistence/index.js";

const SIGNATURE_MAX_AGE_SECONDS = 5 * 60;

export interface MoonPaySellWebhook {
  readonly orderId: string;
  readonly moonPayTransactionId: string;
  readonly baseCurrencyCode: string;
  readonly depositWalletAddress: string;
  readonly depositWalletTag: string | null;
  readonly status: "ready" | "completed" | "failed" | "cancelled";
}

export function parseUsdcAmountToAtomic(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d+)(?:\.(\d{1,6}))?$/);

  if (!match?.[1]) {
    throw new PersistenceValidationError("amount must be a valid USDC amount");
  }

  const whole = BigInt(match[1]);
  const fraction = (match[2] ?? "").padEnd(6, "0");
  const atomic = whole * 1_000_000n + BigInt(fraction || "0");

  if (atomic <= 0n) {
    throw new PersistenceValidationError("amount must be greater than zero");
  }

  return atomic.toString();
}

export function verifyMoonPayWebhookSignature(input: {
  readonly rawBody: string;
  readonly signatureHeader: string | undefined;
  readonly webhookKey: string;
  readonly now?: Date;
}): boolean {
  if (!input.signatureHeader) return false;

  const parts = Object.fromEntries(
    input.signatureHeader
      .split(",")
      .map((part) => part.trim().split("=", 2))
      .filter((part): part is [string, string] => part.length === 2),
  );

  const timestamp = parts.t;
  const signature = parts.s;

  if (!timestamp || !signature || !/^\d+$/.test(timestamp) || !/^[0-9a-f]+$/i.test(signature)) {
    return false;
  }

  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1_000);

  if (
    !Number.isSafeInteger(timestampSeconds)
    || Math.abs(nowSeconds - timestampSeconds) > SIGNATURE_MAX_AGE_SECONDS
  ) {
    return false;
  }

  const expected = createHmac("sha256", input.webhookKey)
    .update(`${timestamp}.${input.rawBody}`)
    .digest();

  const received = Buffer.from(signature, "hex");

  return received.length === expected.length
    && timingSafeEqual(received, expected);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}


function moonPayOrderStatus(data: Record<string, unknown>):
  "ready" | "completed" | "failed" | "cancelled" {
  const raw = stringValue(data, "status")?.toLowerCase();

  if (raw === "completed") return "completed";
  if (raw === "failed") return "failed";
  if (raw === "cancelled" || raw === "canceled") return "cancelled";

  return "ready";
}

export function parseMoonPaySellWebhook(body: unknown): MoonPaySellWebhook | null {
  const root = asRecord(body);
  if (!root) return null;

  const type = stringValue(root, "type");
  if (type !== "sell_transaction_created" && type !== "sell_transaction_updated") {
    return null;
  }

  const data = asRecord(root.data);
  if (!data) return null;

  const orderId = stringValue(data, "externalTransactionId");
  const moonPayTransactionId = stringValue(data, "id");
  const baseCurrency = asRecord(data.baseCurrency);
  const baseCurrencyCode =
    stringValue(baseCurrency, "code")
    ?? stringValue(data, "baseCurrencyCode");
  const depositWallet = asRecord(data.depositWallet);
  const rawDepositAddress =
    stringValue(depositWallet, "walletAddress")
    ?? stringValue(data, "depositWalletAddress");
  const depositWalletTag =
    stringValue(depositWallet, "walletAddressTag")
    ?? stringValue(data, "depositWalletTag");

  if (
    !orderId
    || !moonPayTransactionId
    || baseCurrencyCode?.toLowerCase() !== "usdc_base"
    || !rawDepositAddress
  ) {
    return null;
  }

  let depositWalletAddress: string;
  try {
    depositWalletAddress = getAddress(rawDepositAddress);
  } catch {
    return null;
  }

  return {
    orderId,
    moonPayTransactionId,
    baseCurrencyCode: "usdc_base",
    depositWalletAddress,
    depositWalletTag,
    status: moonPayOrderStatus(data),
  };
}
