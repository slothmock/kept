import {
  arbitrum,
  base,
  mainnet,
  optimism,
  type Chain,
} from "@privy-io/chains";
import { monad } from "viem/chains";

import { createLocalAnvilChain } from "@/wallet/local-anvil-chain";
import { createMonadTestnetChain } from "@/wallet/monad-testnet-chain";
import { readFiatEnabled } from "@/config/feature-flags";
import { readVaultConfig } from "@/vault/config";

type BootstrapEnvironment =
  Readonly<Record<string, string | boolean | undefined>>;

export interface AppBootstrapConfig {
  readonly privyAppId: string;
  readonly fiatEnabled: boolean;
  readonly moonPayPublishableKey: string | null;
  readonly keptChain: Chain;
  readonly supportedChains: readonly Chain[];
}

export type AppBootstrapResult =
  | {
      readonly kind: "ready";
      readonly config: AppBootstrapConfig;
    }
  | {
      readonly kind: "error";
      readonly message: string;
    };

function readString(
  environment: BootstrapEnvironment,
  key: string,
): string | undefined {
  const value = environment[key];
  return typeof value === "string"
    ? value
    : undefined;
}

export function resolveAppBootstrap(
  environment: BootstrapEnvironment,
): AppBootstrapResult {
  const privyAppId =
    readString(
      environment,
      "VITE_PRIVY_APP_ID",
    );

  if (!privyAppId) {
    return {
      kind: "error",
      message:
        "VITE_PRIVY_APP_ID is required to start Kept.",
    };
  }

  const fiatEnabled =
    readFiatEnabled(environment);

  const moonPayPublishableKey =
    readString(
      environment,
      "VITE_MOONPAY_PUBLISHABLE_KEY",
    ) ?? null;

  if (
    fiatEnabled
    && !moonPayPublishableKey
  ) {
    return {
      kind: "error",
      message:
        "VITE_MOONPAY_PUBLISHABLE_KEY is required when fiat is enabled.",
    };
  }

  const vaultConfig =
    readVaultConfig({
      VITE_MONAD_RPC_URL:
        readString(
          environment,
          "VITE_MONAD_RPC_URL",
        ),
      VITE_MONAD_CHAIN_ID:
        readString(
          environment,
          "VITE_MONAD_CHAIN_ID",
        ),
      VITE_ENABLE_LOCAL_ANVIL:
        readString(
          environment,
          "VITE_ENABLE_LOCAL_ANVIL",
        ),
      VITE_KEPT_VAULT_ADDRESS:
        readString(
          environment,
          "VITE_KEPT_VAULT_ADDRESS",
        ),
      VITE_MONAD_USDC_ADDRESS:
        readString(
          environment,
          "VITE_MONAD_USDC_ADDRESS",
        ),
    });

  const keptChain: Chain =
    vaultConfig?.chainId === 31_337
      ? createLocalAnvilChain(
          vaultConfig.rpcUrl,
        )
      : vaultConfig?.chainId === 10_143
        ? createMonadTestnetChain(
            vaultConfig.rpcUrl,
          )
        : monad;

  return {
    kind: "ready",
    config: {
      privyAppId,
      fiatEnabled,
      moonPayPublishableKey,
      keptChain,
      supportedChains: [
        keptChain,
        base,
        mainnet,
        arbitrum,
        optimism,
      ],
    },
  };
}
