// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStagingFaucetController, FAUCET_NOTICE_DURATION_MS } from "../src/features/savings/use-staging-faucet-controller.js";
import type { KeptApi } from "../src/api/kept-api.js";

const account = "0x1111111111111111111111111111111111111111" as const;
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("testnet faucet notice lifecycle", () => {
  it("dismisses a successful claim notice after eight seconds", async () => {
    vi.useFakeTimers();
    const api = { claimStagingFaucet: vi.fn().mockResolvedValue({ amountAtomic: "10000000" }) } as unknown as KeptApi;
    const refreshPosition = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useStagingFaucetController({ api, account, chainId: 10143, refreshPosition }));
    await act(async () => { await result.current.claim(); });
    expect(result.current.status).toBe("Added 10 test USDC.");
    act(() => { vi.advanceTimersByTime(FAUCET_NOTICE_DURATION_MS); });
    expect(result.current.status).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("clears an error on timeout without changing account", async () => {
    vi.useFakeTimers();
    const api = { claimStagingFaucet: vi.fn().mockRejectedValue(new Error("Service unavailable")) } as unknown as KeptApi;
    const { result } = renderHook(() => useStagingFaucetController({ api, account, chainId: 10143, refreshPosition: async () => {} }));
    await act(async () => { await result.current.claim(); });
    expect(result.current.error).toBeTruthy();
    act(() => { vi.advanceTimersByTime(FAUCET_NOTICE_DURATION_MS); });
    expect(result.current.error).toBeNull();
  });
});
