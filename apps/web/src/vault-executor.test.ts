import { describe, expect, it, vi } from "vitest";

import { submitVaultDeposit, submitVaultWithdrawal } from "./vault-executor.js";

const approval = {
  to: "0x1111111111111111111111111111111111111111" as const,
  data: "0x01" as const,
  chainId: 143,
};
const deposit = {
  to: "0x2222222222222222222222222222222222222222" as const,
  data: "0x02" as const,
  chainId: 143,
};

describe("vault deposit submission", () => {
  it("confirms approval before submitting the vault deposit when allowance is insufficient", async () => {
    const sendTransaction = vi.fn()
      .mockResolvedValueOnce("0xaaa")
      .mockResolvedValueOnce("0xbbb");
    const waitForTransactionReceipt = vi.fn().mockResolvedValue({ status: "success" });

    const result = await submitVaultDeposit({
      allowance: 1n,
      assets: 2n,
      approval,
      deposit,
      sender: { sendTransaction },
      receipts: { waitForTransactionReceipt },
    });

    expect(sendTransaction).toHaveBeenCalledTimes(2);
    expect(sendTransaction).toHaveBeenNthCalledWith(1, approval);
    expect(sendTransaction).toHaveBeenNthCalledWith(2, deposit);
    expect(waitForTransactionReceipt).toHaveBeenNthCalledWith(1, { hash: "0xaaa" });
    expect(waitForTransactionReceipt).toHaveBeenNthCalledWith(2, { hash: "0xbbb" });
    expect(result).toEqual({ approvalHash: "0xaaa", depositHash: "0xbbb" });
  });

  it("confirms the withdrawal transaction before reporting the withdrawal as submitted", async () => {
    const sendTransaction = vi.fn().mockResolvedValue("0xccc");
    const waitForTransactionReceipt = vi.fn().mockResolvedValue({ status: "success" });

    await expect(submitVaultWithdrawal({
      withdrawal: deposit,
      sender: { sendTransaction },
      receipts: { waitForTransactionReceipt },
    })).resolves.toEqual({ withdrawalHash: "0xccc" });

    expect(sendTransaction).toHaveBeenCalledWith(deposit);
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: "0xccc" });
  });
});
