export async function joinWaitlist(input: {
  readonly apiBaseUrl: string;
  readonly email: string;
  readonly fetcher?: typeof fetch;
}): Promise<void> {
  const fetcher =
    input.fetcher
    ?? fetch;

  let response:
    Response;

  try {
    response =
      await fetcher(
        `${input.apiBaseUrl}/v1/waitlist`,
        {
          method:
            "POST",
          headers: {
            "content-type":
              "application/json",
          },
          body:
            JSON.stringify({
              email:
                input.email,
            }),
        },
      );
  } catch {
    throw new Error(
      "Kept couldn't connect. Check your connection and try again.",
    );
  }

  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? "Too many requests. Try again shortly."
        : response.status === 503
          ? "Waitlist signup is temporarily unavailable. Please try again later."
          : "We couldn't add you to the waitlist. Try again.",
    );
  }
}
