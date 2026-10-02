import { describe, expect, it, vi } from "vitest";

import { createBoundTransactionSender } from "../src/chain/transaction-sender.js";

const transaction = {
  to: "0x1111111111111111111111111111111111111111",
  data: "0x",
  chainId: 143,
} as const;

describe("createBoundTransactionSender", () => {
  it("requests Privy gas sponsorship for the selected wallet", async () => {
    const send = vi.fn(async () => ({ hash: "0x1234" as const }));
    const sender = createBoundTransactionSender(
      send,
      "0x2222222222222222222222222222222222222222",
    );

    await expect(sender.sendTransaction(transaction)).resolves.toBe("0x1234");
    expect(send).toHaveBeenCalledWith(transaction, {
      address: "0x2222222222222222222222222222222222222222",
      sponsor: true,
    });
  });

  it("fails closed when no selected wallet address is available", async () => {
    const send = vi.fn(async () => ({ hash: "0x1234" as const }));
    const sender = createBoundTransactionSender(send, null);

    await expect(sender.sendTransaction(transaction)).rejects.toThrow(
      "Your Kept account is not ready yet.",
    );
    expect(send).not.toHaveBeenCalled();
  });
});
