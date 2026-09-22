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

  it("maps wallet rejection without exposing the provider message", () => {
    expect(consumerErrorMessage(
      { code: 4001, message: "User rejected request with calldata 0xdeadbeef" },
      "We could not complete that request.",
    )).toBe("You cancelled the request. No money was moved.");
  });

  it("maps typed contract reverts without exposing revert details", () => {
    expect(consumerErrorMessage(
      Object.assign(new Error("execution reverted: AccessControlUnauthorizedAccount(0x1234)"), {
        name: "ContractFunctionRevertedError",
      }),
      "We could not add your money. Try again.",
    )).toBe("The transaction was not completed. Your money was not moved.");
  });
});
