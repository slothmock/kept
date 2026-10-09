import { describe, expect, it, vi } from "vitest";
import { createResendWaitlist } from "../src/resend-waitlist.js";

describe("Resend waitlist", () => {
  const settings = { apiKey: "test-key", segmentId: "test-segment" };

  it("normalizes email and submits it to the chosen segment", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 201 }));
    await createResendWaitlist({ ...settings, fetcher })("  SOMEONE@Example.com  ");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.resend.com/contacts");
    const request = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(request.method).toBe("POST");
    expect(JSON.parse(request.body as string)).toEqual({
      email: "someone@example.com",
      segments: [{ id: "test-segment" }],
    });
  });

  it("does not treat an existing contact as a failure", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 409 }));
    await expect(createResendWaitlist({ ...settings, fetcher })("a@example.com")).resolves.toBeUndefined();
  });

  it("propagates provider failures instead of reporting a successful signup", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 503 }));
    await expect(createResendWaitlist({ ...settings, fetcher })("a@example.com"))
      .rejects.toThrow("HTTP 503");
  });

  it("rejects invalid email before calling provider", async () => {
    const fetcher = vi.fn();
    await expect(createResendWaitlist({ ...settings, fetcher })("invalid")).rejects.toThrow("Invalid waitlist email");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
