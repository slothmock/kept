interface FiatFeatureEnvironment {
  readonly VITE_FIAT_ENABLED?: string | boolean;
}

export function readFiatEnabled(
  environment: FiatFeatureEnvironment,
): boolean {
  return environment.VITE_FIAT_ENABLED === true
    || environment.VITE_FIAT_ENABLED === "true";
}
