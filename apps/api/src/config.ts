export interface ApiConfig {
  readonly databaseUrl: string;
  readonly privyAppId: string;
  readonly privyJwtVerificationKey: string;
  readonly port: number;
}

function requireValue(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key]?.trim();
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function parsePort(value: string | undefined): number {
  if (value === undefined) {
    return 3000;
  }
  if (!/^\d+$/.test(value)) {
    throw new Error("PORT must be a valid TCP port");
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be a valid TCP port");
  }
  return port;
}

export function loadApiConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    databaseUrl: requireValue(environment, "DATABASE_URL"),
    privyAppId: requireValue(environment, "PRIVY_APP_ID"),
    privyJwtVerificationKey: requireValue(environment, "PRIVY_JWT_VERIFICATION_KEY"),
    port: parsePort(environment.PORT),
  };
}
