import { getAddress, type Address } from "viem";

export interface ApiConfig {
  readonly databaseUrl: string;
  readonly privyAppId: string;
  readonly privyJwtVerificationKey: string;
  readonly privyAppSecret: string;
  readonly port: number;
  readonly webOrigin: string;
  readonly monadRpcUrl: string;
  readonly solanaRpcUrl: string;
  readonly monadChainId: 143 | 10143 | 31337;
  readonly commitmentManagerAddress: Address;
  readonly commitmentVerifierPrivateKey: `0x${string}`;
  readonly keptSavingsVaultAddress: Address;
  readonly commitmentWindowOverrideSeconds?: number | undefined;
  readonly auroraIntentsBaseUrl: string;
  readonly auroraIntentsApiKey: string;
  readonly moonPayPublishableKey: string;
  readonly moonPaySecretKey: string;
  readonly moonPayBaseUrl: string;
}

function parseCommitmentWindowOverride(
  environment: NodeJS.ProcessEnv,
  chainId: 143 | 10143 | 31337,
): number | undefined {
  const raw = environment.DEV_COMMITMENT_WINDOW_SECONDS?.trim();

  if (!raw) return undefined;

  if (
    chainId !== 31337
    || environment.ENABLE_LOCAL_ANVIL !== "true"
  ) {
    throw new Error(
      "DEV_COMMITMENT_WINDOW_SECONDS may only be used with local Anvil",
    );
  }

  if (!/^\d+$/.test(raw)) {
    throw new Error(
      "DEV_COMMITMENT_WINDOW_SECONDS must be an integer between 10 and 86400",
    );
  }

  const seconds = Number(raw);

  if (
    !Number.isSafeInteger(seconds)
    || seconds < 10
    || seconds > 86_400
  ) {
    throw new Error(
      "DEV_COMMITMENT_WINDOW_SECONDS must be an integer between 10 and 86400",
    );
  }

  return seconds;
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

function parseChainId(environment: NodeJS.ProcessEnv): 143 | 10143 | 31337 {
  const value = requireValue(environment, "MONAD_CHAIN_ID");
  if (value === "143") return 143;
  if (value === "10143") return 10143;
  if (value === "31337" && environment.ENABLE_LOCAL_ANVIL === "true") return 31337;
  throw new Error("MONAD_CHAIN_ID must be 143, 10143, or 31337 with ENABLE_LOCAL_ANVIL=true");
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

export function loadApiConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ApiConfig {
  const databaseUrl =
    requireValue(
      environment,
      "DATABASE_URL",
    );

  const privyAppId =
    requireValue(
      environment,
      "PRIVY_APP_ID",
    );

  const privyJwtVerificationKey =
    requireValue(
      environment,
      "PRIVY_JWT_VERIFICATION_KEY",
    );

  const privyAppSecret =
    requireValue(
      environment,
      "PRIVY_APP_SECRET",
    );

  const port =
    parsePort(
      environment.PORT,
    );

  const webOrigin =
    requireValue(
      environment,
      "WEB_ORIGIN",
    );

  const monadRpcUrl =
    requireHttpUrl(
      environment,
      "MONAD_RPC_URL",
    );

  const solanaRpcUrl =
    requireHttpUrl(
      environment,
      "HELIUS_RPC_URL",
    );

  const monadChainId =
    parseChainId(environment);

  const commitmentManagerAddress =
    requireAddress(
      environment,
      "COMMITMENT_MANAGER_ADDRESS",
    );

  const commitmentVerifierPrivateKey =
    requirePrivateKey(
      environment,
      "COMMITMENT_VERIFIER_PRIVATE_KEY",
    );

  const keptSavingsVaultAddress =
    requireAddress(
      environment,
      "KEPT_SAVINGS_VAULT_ADDRESS",
    );

  const commitmentWindowOverrideSeconds =
    parseCommitmentWindowOverride(
      environment,
      monadChainId,
    );

  const auroraIntentsBaseUrl =
    requireHttpUrl(
      environment,
      "AURORA_INTENTS_BASE_URL",
    );

  const auroraIntentsApiKey =
    requireValue(
      environment,
      "AURORA_INTENTS_API_KEY",
    );

  const moonPayBaseUrl =
    requireValue(
      environment,
      "MOONPAY_WIDGET_BASE_URL",
    );

  const moonPayPublishableKey =
    requireValue(
      environment,
      "MOONPAY_PUBLISHABLE_KEY",
    );

  const moonPaySecretKey =
    requireValue(
      environment,
      "MOONPAY_SECRET_KEY",
    );

  return {
    databaseUrl,
    privyAppId,
    privyJwtVerificationKey,
    privyAppSecret,
    port,
    webOrigin,
    monadRpcUrl,
    solanaRpcUrl,
    monadChainId,
    commitmentManagerAddress,
    commitmentVerifierPrivateKey,
    keptSavingsVaultAddress,
    commitmentWindowOverrideSeconds,
    auroraIntentsBaseUrl,
    auroraIntentsApiKey,
    moonPayBaseUrl,
    moonPayPublishableKey,
    moonPaySecretKey,
  };
}
