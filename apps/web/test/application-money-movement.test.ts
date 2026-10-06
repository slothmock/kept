import { describe, expect, it, vi } from "vitest";

import {
  deliverBankWithdrawal,
} from "../src/features/withdrawals/core/bank-withdrawal.js";
import {
  submitVaultDeposit,
  submitVaultWithdrawal,
} from "../src/wallet/vault/transfers.js";

describe("money movement application workflows", () => {
  it("does not repeat a bank transfer when acknowledgement is retried", async () => {
    const pending =
      new Map<string, string>();

    const store = {
      load: (orderId: string) =>
        pending.get(orderId) ?? null,
      save: (
        orderId: string,
        reference: string,
      ) => {
        pending.set(
          orderId,
          reference,
        );
      },
      clear: (orderId: string) => {
        pending.delete(orderId);
      },
    };

    const execute =
      vi.fn(async () => ({
        id: "execution-1",
      }));

    const acknowledge =
      vi.fn()
        .mockRejectedValueOnce(
          new Error("temporary"),
        )
        .mockResolvedValueOnce({
          status: "funds_sent",
        });

    await expect(
      deliverBankWithdrawal({
        orderId: "order-1",
        store,
        execute,
        acknowledge,
      }),
    ).rejects.toThrow(
      "temporary",
    );

    await expect(
      deliverBankWithdrawal({
        orderId: "order-1",
        store,
        execute,
        acknowledge,
      }),
    ).resolves.toEqual({
      status: "funds_sent",
    });

    expect(execute)
      .toHaveBeenCalledTimes(1);
  });

  it("revalidates before each vault transaction send", async () => {
    const events: string[] = [];

    await submitVaultDeposit({
      allowance: 0n,
      assets: 10n,
      approval: {
        to: "0x1111111111111111111111111111111111111111",
        data: "0x01",
        chainId: 143,
      },
      deposit: {
        to: "0x2222222222222222222222222222222222222222",
        data: "0x02",
        chainId: 143,
      },
      beforeSend: async (
        transaction,
      ) => {
        events.push(
          `validate:${transaction.data}`,
        );
      },
      sender: {
        sendTransaction:
          async (transaction) => {
            events.push(
              `send:${transaction.data}`,
            );

            return transaction.data
              === "0x01"
              ? "0xaaa"
              : "0xbbb";
          },
      },
      receipts: {
        waitForTransactionReceipt:
          async ({ hash }) => {
            events.push(
              `receipt:${hash}`,
            );

            return {
              status:
                "success",
            };
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

  it("revalidates immediately before a vault withdrawal send", async () => {
    const events: string[] = [];

    await expect(
      submitVaultWithdrawal({
        withdrawal: {
          to: "0x2222222222222222222222222222222222222222",
          data: "0x03",
          chainId: 143,
        },
        beforeSend: async (
          transaction,
        ) => {
          events.push(
            `validate:${transaction.data}`,
          );
        },
        sender: {
          sendTransaction:
            async (transaction) => {
              events.push(
                `send:${transaction.data}`,
              );

              return "0xccc";
            },
        },
        receipts: {
          waitForTransactionReceipt:
            async ({ hash }) => {
              events.push(
                `receipt:${hash}`,
              );

              return {
                status:
                  "success",
              };
            },
        },
      }),
    ).resolves.toEqual({
      withdrawalHash:
        "0xccc",
    });

    expect(events).toEqual([
      "validate:0x03",
      "send:0x03",
      "receipt:0xccc",
    ]);
  });

  it("does not report a reverted vault withdrawal as completed", async () => {
    await expect(
      submitVaultWithdrawal({
        withdrawal: {
          to: "0x2222222222222222222222222222222222222222",
          data: "0x03",
          chainId: 143,
        },
        beforeSend:
          async () => {},
        sender: {
          sendTransaction:
            async () =>
              "0xccc",
        },
        receipts: {
          waitForTransactionReceipt:
            async () => ({
              status:
                "reverted",
            }),
        },
      }),
    ).rejects.toThrow(
      "The transaction was not completed. Your money was not moved.",
    );
  });
});
