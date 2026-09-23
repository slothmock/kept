import { describe, expect, it, vi } from "vitest";

import { createVaultShareBalanceReader } from "../src/vault-shares.js";

const vault = "0x0000000000000000000000000000000000000001" as const;
const account = "0x0000000000000000000000000000000000000002";

describe("vault share balance reader", () => {
  it("reads balanceOf only after verifying the RPC chain", async () => {
    const getChainId = vi.fn(async () => 143);
    const readContract = vi.fn(async () => 123n);
    const reader = createVaultShareBalanceReader({
      publicClient: { getChainId, readContract },
      vault,
      chainId: 143,
    });

    await expect(reader.readShares(account)).resolves.toBe(123n);
    expect(getChainId).toHaveBeenCalledOnce();
    expect(readContract).toHaveBeenCalledWith(expect.objectContaining({
      address: vault,
      functionName: "balanceOf",
      args: [account],
    }));
  });

  it("rejects a wrong-chain RPC without reading the vault", async () => {
    const readContract = vi.fn(async () => 123n);
    const reader = createVaultShareBalanceReader({
      publicClient: { getChainId: async () => 1, readContract },
      vault,
      chainId: 143,
    });

    await expect(reader.readShares(account)).rejects.toThrow("RPC chain ID does not match");
    expect(readContract).not.toHaveBeenCalled();
  });
});
