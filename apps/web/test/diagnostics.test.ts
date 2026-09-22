import { describe, expect, it, vi } from "vitest";

import { createDiagnostics } from "../src/lib/diagnostics.js";
import { ConsumerError } from "../src/lib/consumer-error.js";

describe("application diagnostics", () => {
  it("records structured technical errors while redacting credentials", () => {
    const sink = vi.fn();
    const diagnostics = createDiagnostics({
      now: () => "2026-09-22T18:00:00.000Z",
      sink,
    });
    const error = new Error("RPC failed with Authorization: Bearer secret-token at https://rpc.example");

    diagnostics.error("vault.position_refresh_failed", error, {
      operation: "read_position",
      authorization: "Bearer another-secret",
    });

    expect(sink).toHaveBeenCalledWith({
      timestamp: "2026-09-22T18:00:00.000Z",
      level: "error",
      event: "vault.position_refresh_failed",
      error: expect.objectContaining({
        name: "Error",
        message: "RPC failed with Authorization: Bearer [REDACTED] at https://rpc.example",
      }),
      context: {
        operation: "read_position",
        authorization: "[REDACTED]",
      },
    });
  });

  it("normalizes non-Error failures without exposing object internals", () => {
    const sink = vi.fn();
    const diagnostics = createDiagnostics({ sink, now: () => "now" });

    diagnostics.error("unknown.failure", { token: "private", detail: "failed" });

    expect(sink).toHaveBeenCalledWith(expect.objectContaining({
      error: { name: "UnknownError", message: "Non-Error value thrown" },
    }));
  });

  it("retains nested causes while redacting financial and authentication data", () => {
    const sink = vi.fn();
    const diagnostics = createDiagnostics({ sink });
    const cause = new Error(
      "RPC https://rpc.example/path?api_key=private failed for 0x1111111111111111111111111111111111111111 with Bearer private-token",
    );

    diagnostics.error("vault.deposit_failed", new ConsumerError("The transaction failed.", {
      code: "contract_reverted",
      cause,
      diagnosticCode: "CALL_EXCEPTION",
    }), {
      amountAtomic: "1000000",
      transactionHash: `0x${"2".repeat(64)}`,
    });

    const serialized = JSON.stringify(sink.mock.calls[0]);
    expect(serialized).toContain("CALL_EXCEPTION");
    expect(serialized).toContain("rpc.example/path[REDACTED]");
    expect(serialized).not.toContain("api_key=private");
    expect(serialized).not.toContain("1111111111111111111111111111111111111111");
    expect(serialized).not.toContain("private-token");
    expect(serialized).not.toContain("1000000");
    expect(serialized).not.toContain("2222222222222222222222222222222222222222");
  });
});
