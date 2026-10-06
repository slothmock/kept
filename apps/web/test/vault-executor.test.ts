import { describe, expect, it } from "vitest";

import { submitVaultDeposit } from "../src/wallet/vault/executor.js";
import type { UnsignedVaultTransaction } from "../src/wallet/vault/transactions.js";

const approval: UnsignedVaultTransaction = {
  to: "0x1111111111111111111111111111111111111111",
  data: "0x01",
  chainId: 143,
};
const deposit: UnsignedVaultTransaction = {
  to: "0x2222222222222222222222222222222222222222",
  data: "0x02",
  chainId: 143,
};

describe("submitVaultDeposit network revalidation", () => {
  it("revalidates immediately before both approval and deposit sends", async () => {
    const events: string[] = [];

    await submitVaultDeposit({
      allowance: 0n,
      assets: 10n,
      approval,
      deposit,
      beforeSend: async (transaction) => {
        events.push(`validate:${transaction.data}`);
      },
      sender: {
        sendTransaction: async (transaction) => {
          events.push(`send:${transaction.data}`);
          return transaction === approval ? "0xaaa" : "0xbbb";
        },
      },
      receipts: {
        waitForTransactionReceipt: async ({ hash }) => {
          events.push(`receipt:${hash}`);
          return { status: "success" };
        },
      },
    });

    expect(events).toEqual([
      "validate:0x01",
      "send:0x01",
      "receipt:0xaaa",
      "validate:0x02",
      "send:0x02",
      "receipt:0xbbb",
    ]);
  });

  it("does not send the deposit when revalidation fails after approval", async () => {
    let validations = 0;
    const sent: string[] = [];

    await expect(submitVaultDeposit({
      allowance: 0n,
      assets: 10n,
      approval,
      deposit,
      beforeSend: async () => {
        validations += 1;
        if (validations === 2) throw new Error("Network changed");
      },
      sender: {
        sendTransaction: async (transaction) => {
          sent.push(transaction.data);
          return "0xaaa";
        },
      },
      receipts: {
        waitForTransactionReceipt: async () => ({ status: "success" }),
      },
    })).rejects.toThrow("Network changed");

    expect(sent).toEqual(["0x01"]);
  });
});
