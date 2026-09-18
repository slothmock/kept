import { decodeFunctionData, erc20Abi } from "viem";
import { describe, expect, it } from "vitest";

import {
  buildVaultDepositTransactions,
  buildVaultWithdrawTransaction,
} from "./vault-transactions.js";

const usdc = "0x1111111111111111111111111111111111111111" as const;
const vault = "0x2222222222222222222222222222222222222222" as const;
const receiver = "0x3333333333333333333333333333333333333333" as const;

describe("vault deposit transactions", () => {
  it("builds an approval followed by a deposit to the configured Kept vault", () => {
    const [approval, deposit] = buildVaultDepositTransactions({
      usdc,
      vault,
      receiver,
      assets: 1_250_000n,
      chainId: 143,
    });

    expect(approval.to).toBe(usdc);
    expect(approval.chainId).toBe(143);
    expect(decodeFunctionData({ abi: erc20Abi, data: approval.data })).toMatchObject({
      functionName: "approve",
      args: [vault, 1_250_000n],
    });

    expect(deposit.to).toBe(vault);
    expect(deposit.chainId).toBe(143);
    expect(deposit.data).toBe("0x6e553f6500000000000000000000000000000000000000000000000000000000001312d00000000000000000000000003333333333333333333333333333333333333333");
  });

  it("builds a user-authorized withdrawal from the configured Kept vault", () => {
    const withdrawal = buildVaultWithdrawTransaction({
      vault,
      receiver,
      owner: receiver,
      assets: 1_250_000n,
      chainId: 143,
    });

    expect(withdrawal.to).toBe(vault);
    expect(withdrawal.chainId).toBe(143);
    expect(withdrawal.data).toBe("0xb460af9400000000000000000000000000000000000000000000000000000000001312d000000000000000000000000033333333333333333333333333333333333333330000000000000000000000003333333333333333333333333333333333333333");
  });
});
