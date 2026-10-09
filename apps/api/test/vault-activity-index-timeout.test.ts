import { afterEach, describe, expect, it, vi } from "vitest";
import { withVaultIndexTimeout } from "../src/vault-activity-index.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("vault activity index RPC timeout", () => {
  it("returns values from a responsive RPC", async () => {
    await expect(
      withVaultIndexTimeout(Promise.resolve(10143), "getChainId", 50),
    ).resolves.toBe(10143);
  });

  it("reports the stalled operation rather than blocking indefinitely", async () => {
    vi.useFakeTimers();
    const stalled = new Promise<bigint>(() => {});
    const result = withVaultIndexTimeout(stalled, "getBlockNumber", 100);
    const expectation = expect(result).rejects.toThrow(
      "Vault activity index RPC timed out: getBlockNumber",
    );
    await vi.advanceTimersByTimeAsync(100);
    await expectation;
  });

  it("propagates RPC failures without converting them to timeouts", async () => {
    await expect(
      withVaultIndexTimeout(Promise.reject(new Error("RPC unavailable")), "getLogs", 50),
    ).rejects.toThrow("RPC unavailable");
  });
});
