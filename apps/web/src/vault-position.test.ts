import { describe, expect, it, vi } from "vitest";

import { readVaultPosition } from "./vault-position.js";

const usdc = "0x1111111111111111111111111111111111111111" as const;
const vault = "0x2222222222222222222222222222222222222222" as const;
const account = "0x3333333333333333333333333333333333333333" as const;

describe("on-chain vault position", () => {
  it("reads the user's USDC, allowance, shares, and assets from the configured contracts", async () => {
    const readContract = vi.fn()
      .mockResolvedValueOnce(5_000_000n)
      .mockResolvedValueOnce(2_000_000n)
      .mockResolvedValueOnce(1_750_000n)
      .mockResolvedValueOnce(1_800_000n);

    await expect(readVaultPosition({
      publicClient: { readContract },
      usdc,
      vault,
      account,
    })).resolves.toEqual({
      usdcBalance: 5_000_000n,
      allowance: 2_000_000n,
      shares: 1_750_000n,
      assets: 1_800_000n,
    });

    expect(readContract).toHaveBeenCalledTimes(4);
  });
});
