export type PublicLaunchMode =
  | "live"
  | "waitlist";

type PublicEnvironment =
  Readonly<
    Record<
      string,
      string | undefined
    >
  >;

export function readPublicLaunchMode(
  environment:
    PublicEnvironment,
): PublicLaunchMode {
  return environment
    .VITE_PUBLIC_LAUNCH_MODE
    ?.trim()
    .toLowerCase()
    === "waitlist"
    ? "waitlist"
    : "live";
}
