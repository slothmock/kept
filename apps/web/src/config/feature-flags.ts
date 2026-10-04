export function readFiatEnabled(
  environment: unknown,
): boolean {
  if (
    typeof environment !== "object"
    || environment === null
  ) {
    return false;
  }

  const value =
    (environment as Record<string, unknown>)
      .VITE_FIAT_ENABLED;

  return value === true
    || value === "true";
}
