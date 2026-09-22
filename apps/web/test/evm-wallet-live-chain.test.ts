import { describe, expect, it } from "vitest";

import { observeProviderChainId } from "../src/chain/evm-wallet.js";

describe("live EVM wallet chain", () => {
  it("reports the initial provider chain and later chainChanged events", async () => {
    let listener: ((chainId: unknown) => void) | undefined;
    const observed: Array<number | null> = [];
    const stop = observeProviderChainId({
      request: async () => "0x8f",
      on(event, nextListener) {
        expect(event).toBe("chainChanged");
        listener = nextListener;
      },
      removeListener(event, nextListener) {
        expect(event).toBe("chainChanged");
        expect(nextListener).toBe(listener);
        listener = undefined;
      },
    }, (chainId) => observed.push(chainId));

    await Promise.resolve();
    expect(observed).toEqual([143]);

    listener?.("0x1");
    expect(observed).toEqual([143, 1]);

    stop();
    expect(listener).toBeUndefined();
  });

  it("reports an unavailable chain when the provider read fails", async () => {
    const observed: Array<number | null> = [];
    observeProviderChainId({
      request: async () => {
        throw new Error("provider unavailable");
      },
    }, (chainId) => observed.push(chainId));

    await Promise.resolve();
    await Promise.resolve();
    expect(observed).toEqual([null]);
  });

  it("does not overwrite a chainChanged event with an older initial read", async () => {
    let resolveInitialRead: ((chainId: unknown) => void) | undefined;
    let listener: ((chainId: unknown) => void) | undefined;
    const observed: Array<number | null> = [];
    observeProviderChainId({
      request: () => new Promise((resolve) => {
        resolveInitialRead = resolve;
      }),
      on(_event, nextListener) {
        listener = nextListener;
      },
    }, (chainId) => observed.push(chainId));

    listener?.("0x1");
    resolveInitialRead?.("0x8f");
    await Promise.resolve();

    expect(observed).toEqual([1]);
  });
});
