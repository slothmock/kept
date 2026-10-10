/** Server-side Resend Contacts API integration. No email is sent on signup. */
export function createResendWaitlist(input: {
  readonly apiKey: string;
  readonly segmentId: string;
  readonly fetcher?: typeof fetch;
}) {
  const fetcher = input.fetcher ?? fetch;
  return async (email: string): Promise<void> => {
    const normalized = email.trim().toLowerCase();
    if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw new Error("Invalid waitlist email");
    }

    const response = await fetcher("https://api.resend.com/contacts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: normalized,
        segments: [{ id: input.segmentId }],
      }),
      signal: AbortSignal.timeout(10_000),
    });

    // Existing contacts must not be re-subscribed automatically.
    if (response.status === 409) return;
    if (!response.ok) {
      throw new Error(`Resend waitlist signup failed (HTTP ${response.status})`);
    }
  };
}
