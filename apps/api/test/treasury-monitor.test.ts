import { describe, expect, it, vi } from "vitest";
import type { PublicClient } from "viem";
import { readTreasuryHealth } from "../src/treasury-monitor.js";

const vault = "0x1111111111111111111111111111111111111111";
const treasury = "0x2222222222222222222222222222222222222222";

function createClient(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    feeRecipient: treasury,
    vault,
    availableRewardAssets: 9_000_000n,
    totalReservedAssets: 11_000_000n,
    ...overrides,
  };
  const readContract = vi.fn(async ({ functionName }: { functionName: string }) =>
    values[functionName]);
  return { client: { readContract } as unknown as Pick<PublicClient, "readContract">, readContract };
}

describe("readTreasuryHealth", () => {
  it("reports total reserved, available and below-threshold funds in USDC atomic units", async () => {
    const { client, readContract } = createClient();
    const health = await readTreasuryHealth({
      client, vault, lowBalanceThresholdAssets: 10_000_000n,
    });
    expect(health).toEqual({
      treasury, availableAssets: 9_000_000n,
      reservedAssets: 11_000_000n, belowThreshold: true,
    });
    expect(readContract).toHaveBeenCalledTimes(4);
  });

  it("accepts sufficient funding and refuses mismatched vault bindings", async () => {
    const funded = createClient({ availableRewardAssets: 20_000_000n });
    expect((await readTreasuryHealth({
      client: funded.client, vault, lowBalanceThresholdAssets: 10_000_000n,
    })).belowThreshold).toBe(false);

    const mismatched = createClient({ vault: "0x3333333333333333333333333333333333333333" });
    await expect(readTreasuryHealth({
      client: mismatched.client, vault, lowBalanceThresholdAssets: 10_000_000n,
    })).rejects.toThrow("Treasury vault binding");
  });

  it("rejects a negative threshold", async () => {
    await expect(readTreasuryHealth({
      client: createClient().client, vault, lowBalanceThresholdAssets: -1n,
    })).rejects.toThrow("threshold");
  });
});
