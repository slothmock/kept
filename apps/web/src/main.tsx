import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { MoonPayProvider } from "@moonpay/moonpay-react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import {
  arbitrum,
  base,
  mainnet,
  optimism,
  type Chain,
} from "@privy-io/chains";
import { monad } from "viem/chains";

import { KeptApp } from "@/KeptApp";
import { createLocalAnvilChain } from "@/chain/local-anvil-chain";
import { createMonadTestnetChain } from "@/chain/monad-testnet-chain";
import { readFiatEnabled } from "@/config/feature-flags";
import { diagnostics } from "@/lib/diagnostics";
import { readVaultConfig } from "@/vault/config";

import "@/styles.css";

window.addEventListener(
  "error",
  (event) => {
    diagnostics.error(
      "app.unhandled_error",
      event.error ??
      new Error(
        event.message,
      ),
    );
  },
);

window.addEventListener(
  "unhandledrejection",
  (event) => {
    diagnostics.error(
      "app.unhandled_rejection",
      event.reason,
    );
  },
);

const privyAppId =
  import.meta.env
    .VITE_PRIVY_APP_ID;

const fiatEnabled =
  readFiatEnabled(
    import.meta.env,
  );

const moonPayPublishableKey =
  import.meta.env
    .VITE_MOONPAY_PUBLISHABLE_KEY;

const vaultConfig =
  readVaultConfig(
    import.meta.env,
  );

const keptChain:
  Chain =
  vaultConfig?.chainId === 31_337
    ? createLocalAnvilChain(
      vaultConfig.rpcUrl,
    )
    : vaultConfig?.chainId === 10_143
      ? createMonadTestnetChain(
        vaultConfig.rpcUrl,
      )
      : monad;

const supportedChains:
  Chain[] = [
    keptChain,
    base,
    mainnet,
    arbitrum,
    optimism,
  ];

const defaultChain: Chain = keptChain;

const solanaWalletConnectors = toSolanaWalletConnectors();

const root =
  document.getElementById(
    "root",
  );

if (!root) {
  throw new Error(
    "Missing root element",
  );
}

if (!privyAppId) {
  root.textContent =
    "VITE_PRIVY_APP_ID is required to start Kept.";
} else if (
  fiatEnabled
  && !moonPayPublishableKey
) {
  root.textContent =
    "VITE_MOONPAY_PUBLISHABLE_KEY is required when fiat is enabled.";
} else {
  const app = (
    <BrowserRouter>
      <KeptApp />
    </BrowserRouter>
  );

  createRoot(root).render(
    <PrivyProvider
      appId={
        privyAppId
      }
      config={{
        loginMethods: [
          "email",
        ],

        supportedChains,

        defaultChain,

        appearance: {
          walletChainType: "ethereum-and-solana",
        },

        externalWallets: {
          solana: {
            connectors: solanaWalletConnectors,
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
      {fiatEnabled && moonPayPublishableKey ? (
        <MoonPayProvider
          apiKey={moonPayPublishableKey}
          debug={import.meta.env.DEV}
        >
          {app}
        </MoonPayProvider>
      ) : app}
    </PrivyProvider>,
  );
}
