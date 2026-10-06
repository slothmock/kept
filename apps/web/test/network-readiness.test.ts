import { describe, expect, it } from "vitest";

import {
  checkNetworkReadiness,
  parseEvmChainId,
  parseProviderChainId,
} from "../src/wallet/network-readiness.js";

describe("network readiness", () => {
  it("parses EVM CAIP-2 chain identifiers", () => {
    expect(parseEvmChainId("eip155:143")).toBe(143);
    expect(parseEvmChainId("eip155:31337")).toBe(31337);
    expect(parseEvmChainId("solana:mainnet")).toBeNull();
    expect(parseEvmChainId(undefined)).toBeNull();
  });

  it("parses live EIP-1193 chain identifiers", () => {
    expect(parseProviderChainId("0x8f")).toBe(143);
    expect(parseProviderChainId("0x7a69")).toBe(31337);
    expect(parseProviderChainId("143")).toBeNull();
    expect(parseProviderChainId(null)).toBeNull();
  });

  it("rejects an RPC connected to a different chain", async () => {
    await expect(checkNetworkReadiness({
      expectedChainId: 143,
      walletChainId: 143,
      rpc: { getChainId: async () => 1 },
    })).resolves.toMatchObject({
      ready: false,
      message: "Kept's network connection is unavailable. Try again later.",
      diagnostic: expect.any(Error),
    });
  });

  it("returns a consumer-safe error when the RPC cannot be reached", async () => {
    await expect(checkNetworkReadiness({
      expectedChainId: 143,
      walletChainId: 143,
      rpc: {
        getChainId: async () => {
          throw new Error("fetch failed for https://private-rpc.example");
        },
      },
    })).resolves.toMatchObject({
      ready: false,
      message: "Kept's network connection is unavailable. Try again later.",
      diagnostic: expect.objectContaining({ message: "fetch failed for https://private-rpc.example" }),
    });
  });

  it("rejects a wallet connected to a different chain", async () => {
    await expect(checkNetworkReadiness({
      expectedChainId: 143,
      walletChainId: 1,
      rpc: { getChainId: async () => 143 },
    })).resolves.toMatchObject({
      ready: false,
      message: "Your account is connected to a different network. Switch networks before adding or withdrawing money.",
      diagnostic: expect.any(Error),
    });
  });

  it("is ready only when the RPC and wallet match the configured chain", async () => {
    await expect(checkNetworkReadiness({
      expectedChainId: 143,
      walletChainId: 143,
      rpc: { getChainId: async () => 143 },
    })).resolves.toEqual({ ready: true });
  });
});
