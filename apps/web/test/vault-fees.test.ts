import { describe, expect, it } from "vitest";

import {
  formatBasisPoints,
  readVaultDepositQuote,
} from "../src/wallet/vault/fees.js";

const vault = "0x3333333333333333333333333333333333333333";

describe("vault fee disclosure", () => {
  it("adds the 0.2% deposit fee on top of the requested savings amount", async () => {
    const calls: {
      readonly functionName: string;
      readonly args?: readonly bigint[];
    }[] = [];

    const quote = await readVaultDepositQuote({
      assets: 100_000_000n,
      vault,
      publicClient: {
        async readContract(input) {
          const call = input as {
            readonly functionName: string;
            readonly args?: readonly bigint[];
          };
          calls.push(call);

          if (call.functionName === "BPS_DENOMINATOR") return 10_000n;
          if (call.functionName === "DEPOSIT_FEE_BPS") return 20n;
          if (call.functionName === "PROFIT_FEE_BPS") return 1_000n;
          if (call.functionName === "previewDeposit") return 99_800_000_000_000n;
          if (call.functionName === "convertToAssets") return 100_000_000n;

          return 0n;
        },
      },
    });

    expect(quote).toEqual({
      assets: 100_000_000n,
      grossAssets: 100_200_401n,
      depositFeeAssets: 200_401n,
      depositFeeBps: 20n,
      expectedNetAssets: 100_000_000n,
      performanceFeeBps: 1_000n,
      bpsDenominator: 10_000n,
    });

    expect(calls.map(({ functionName }) => functionName)).toEqual([
      "BPS_DENOMINATOR",
      "DEPOSIT_FEE_BPS",
      "PROFIT_FEE_BPS",
      "previewDeposit",
      "convertToAssets",
    ]);

    expect(calls[3]?.args).toEqual([
      100_200_401n,
    ]);
  });

  it("fails closed when the returned fee configuration is invalid", async () => {
    await expect(readVaultDepositQuote({
      assets: 100_000_000n,
      vault,
      publicClient: {
        async readContract(input) {
          const { functionName } = input as { readonly functionName: string };
          if (functionName === "BPS_DENOMINATOR") return 10_000n;
          if (functionName === "DEPOSIT_FEE_BPS") return 10_001n;
          if (functionName === "PROFIT_FEE_BPS") return 1_000n;
          if (functionName === "previewDeposit") return 99_800_000_000_000n;
          return 99_800_000n;
        },
      },
    })).rejects.toThrow("Invalid vault fee configuration");
  });

  it("fails closed when a positive deposit would receive no shares", async () => {
    await expect(readVaultDepositQuote({
      assets: 1n,
      vault,
      publicClient: {
        async readContract(input) {
          const { functionName } = input as { readonly functionName: string };
          if (functionName === "BPS_DENOMINATOR") return 10_000n;
          if (functionName === "DEPOSIT_FEE_BPS") return 20;
          if (functionName === "PROFIT_FEE_BPS") return 1_000;
          return 0n;
        },
      },
    })).rejects.toThrow("Invalid vault deposit preview");
  });

  it("formats basis points without losing fractional percentages", () => {
    expect(formatBasisPoints(20n, 10_000n)).toBe("0.20%");
    expect(formatBasisPoints(1_000n, 10_000n)).toBe("10.00%");
  });
});
