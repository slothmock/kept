import { describe, expect, it } from "vitest";

import {
  ConsumerError,
  consumerErrorMessage,
} from "../src/lib/consumer-error.js";

describe("consumerErrorMessage", () => {
  it("does not expose arbitrary provider or RPC error details", () => {
    expect(consumerErrorMessage(
      new Error("fetch failed for https://private-rpc.example with calldata 0xdeadbeef"),
      "We could not refresh your savings.",
    )).toBe("We could not refresh your savings.");
  });

  it("preserves explicitly designated consumer-safe errors", () => {
    expect(consumerErrorMessage(
      new ConsumerError("Your account is connected to a different network."),
      "We could not complete that request.",
    )).toBe("Your account is connected to a different network.");
  });
});
