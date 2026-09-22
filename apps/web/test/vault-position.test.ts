import { describe, expect, it } from "vitest";

import { readVaultPosition } from "../src/vault/position.js";

const account = "0x1111111111111111111111111111111111111111";
const usdc = "0x2222222222222222222222222222222222222222";
const vault = "0x3333333333333333333333333333333333333333";

describe("readVaultPosition", () => {
  it("uses maxWithdraw as the amount currently available to withdraw", async () => {
    const calls: Array<{
      readonly address: string;
      readonly functionName: string;
      readonly args?: readonly string[];
    }> = [];
    const values: Record<string, bigint> = {
      allowance: 80_000_000n,
      balanceOf: 100_000_000n,
      convertToAssets: 105_000_000n,
      maxWithdraw: 40_000_000n,
    };

    const position = await readVaultPosition({
      publicClient: {
        async readContract(input) {
          const call = input as {
            readonly address: string;
            readonly functionName: string;
            readonly args?: readonly string[];
          };
          const { functionName } = call;
          calls.push(call);
          return values[functionName] ?? 0n;
        },
      },
      account,
      usdc,
      vault,
    });

    expect(position.assets).toBe(105_000_000n);
    expect(position.withdrawableAssets).toBe(40_000_000n);
    expect(calls).toContainEqual(expect.objectContaining({
      address: vault,
      functionName: "maxWithdraw",
      args: [account],
    }));
  });
});
