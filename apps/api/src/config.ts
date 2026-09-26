import { getAddress, type Address } from "viem";

export interface ApiConfig {
  readonly databaseUrl: string;
  readonly privyAppId: string;
  readonly privyJwtVerificationKey: string;
  readonly privyAppSecret: string;
  readonly port: number;
  readonly webOrigin: string;
  readonly monadRpcUrl: string;
  readonly monadChainId: 143 | 31337;
  readonly commitmentManagerAddress: Address;
  readonly commitmentVerifierPrivateKey: Address;
  readonly keptSavingsVaultAddress: Address;
}

function requireValue(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key]?.trim();
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function requirePrivateKey(
  environment: NodeJS.ProcessEnv,
  key: string,
): `0x${string}` {
  const value = requireValue(
    environment,
    key,
  );

  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(
      `${key} must be a 32-byte hex private key`,
    );
  }

  return value as `0x${string}`;
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

function parseChainId(environment: NodeJS.ProcessEnv): 143 | 31337 {
  const value = requireValue(environment, "MONAD_CHAIN_ID");
  if (value === "143") return 143;
  if (value === "31337" && environment.ENABLE_LOCAL_ANVIL === "true") return 31337;
  throw new Error("MONAD_CHAIN_ID must be 143, or 31337 with ENABLE_LOCAL_ANVIL=true");
}

function requireHttpUrl(environment: NodeJS.ProcessEnv, key: string): string {
  const value = requireValue(environment, key);
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    return url.toString();
  } catch {
    throw new Error(`${key} must be an absolute HTTP(S) URL`);
  }
}

function requireAddress(environment: NodeJS.ProcessEnv, key: string): Address {
  try {
    return getAddress(requireValue(environment, key));
  } catch {
    throw new Error(`${key} must be a valid EVM address`);
  }
}

export function loadApiConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    databaseUrl: requireValue(environment, "DATABASE_URL"),
    privyAppId: requireValue(environment, "PRIVY_APP_ID"),
    privyJwtVerificationKey: requireValue(environment, "PRIVY_JWT_VERIFICATION_KEY"),
    privyAppSecret: requireValue(environment, "PRIVY_APP_SECRET"),
    port: parsePort(environment.PORT),
    webOrigin: environment.WEB_ORIGIN?.trim() || "http://localhost:5173",
    monadRpcUrl: requireHttpUrl(environment, "MONAD_RPC_URL"),
    monadChainId: parseChainId(environment),
    commitmentManagerAddress: requireAddress(environment, "COMMITMENT_MANAGER_ADDRESS"),
    commitmentVerifierPrivateKey: requirePrivateKey(environment, "COMMITMENT_VERIFIER_PRIVATE_KEY"),
    keptSavingsVaultAddress: requireAddress(environment, "KEPT_SAVINGS_VAULT_ADDRESS"),
  };
}
