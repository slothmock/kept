import { describe, expect, it } from "vitest";

import {
  formatBasisPoints,
  readVaultDepositQuote,
} from "../src/vault/fees.js";

const vault = "0x3333333333333333333333333333333333333333";

describe("vault fee disclosure", () => {
  it("reads the configured fees and contract preview for the expected net amount", async () => {
    const calls: string[] = [];
    const values: Record<string, bigint | number> = {
      BPS_DENOMINATOR: 10_000n,
      DEPOSIT_FEE_BPS: 20,
      PROFIT_FEE_BPS: 1_000,
      previewDeposit: 99_800_000_000_000n,
      convertToAssets: 99_800_000n,
    };

    const quote = await readVaultDepositQuote({
      assets: 100_000_000n,
      vault,
      publicClient: {
        async readContract(input) {
          const call = input as { readonly functionName: string };
          calls.push(call.functionName);
          return values[call.functionName] ?? 0n;
        },
      },
    });

    expect(quote).toEqual({
      assets: 100_000_000n,
      depositFeeAssets: 200_000n,
      depositFeeBps: 20n,
      expectedNetAssets: 99_800_000n,
      performanceFeeBps: 1_000n,
      bpsDenominator: 10_000n,
    });
    expect(calls).toEqual([
      "BPS_DENOMINATOR",
      "DEPOSIT_FEE_BPS",
      "PROFIT_FEE_BPS",
      "previewDeposit",
      "convertToAssets",
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
