import {
  MoonPayProvider,
} from "@moonpay/moonpay-react";
import {
  PrivyProvider,
} from "@privy-io/react-auth";
import {
  toSolanaWalletConnectors,
} from "@privy-io/react-auth/solana";
import type {
  ReactNode,
} from "react";
import {
  BrowserRouter,
} from "react-router-dom";

import type {
  AppBootstrapConfig,
} from "@/app/bootstrap-config";

const solanaWalletConnectors =
  toSolanaWalletConnectors();

export function AppProviders({
  config,
  children,
}: {
  readonly config:
    AppBootstrapConfig;
  readonly children:
    ReactNode;
}) {
  const app = (
    <BrowserRouter>
      {children}
    </BrowserRouter>
  );

  return (
    <PrivyProvider
      appId={
        config.privyAppId
      }
      config={{
        loginMethods: [
          "email",
        ],

        supportedChains:
          [...config.supportedChains],

        defaultChain:
          config.keptChain,

        appearance: {
          walletChainType:
            "ethereum-and-solana",
        },

        externalWallets: {
          solana: {
            connectors:
              solanaWalletConnectors,
          },
        },

        embeddedWallets: {
          ethereum: {
            createOnLogin:
              "users-without-wallets",
          },
        },
      }}
    >
      {
        config.fiatEnabled
        && config.moonPayPublishableKey
          ? (
            <MoonPayProvider
              apiKey={
                config.moonPayPublishableKey
              }
              debug={
                import.meta.env.DEV
              }
            >
              {app}
            </MoonPayProvider>
          )
          : app
      }
    </PrivyProvider>
  );
}
