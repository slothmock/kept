import { describe, expect, it, vi } from "vitest";

import {
  createPrivyTransactionSender,
} from "../src/wallet/privy-transaction-sender.js";

const transaction = {
  to: "0x1111111111111111111111111111111111111111",
  data: "0x",
  chainId: 143,
} as const;

describe("Privy transaction sender", () => {
  it("binds transactions to the selected wallet and requests sponsorship", async () => {
    const send = vi.fn(async () => ({
      hash: "0x1234" as const,
    }));

    const sender =
      createPrivyTransactionSender(
        send,
        "0x2222222222222222222222222222222222222222",
      );

    await expect(
      sender.sendTransaction(transaction),
    ).resolves.toBe("0x1234");

    expect(send).toHaveBeenCalledWith(
      transaction,
      {
        address:
          "0x2222222222222222222222222222222222222222",
        sponsor: true,
      },
    );
  });
});
