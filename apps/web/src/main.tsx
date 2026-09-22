import { PrivyProvider } from "@privy-io/react-auth";
import { BrowserRouter } from "react-router-dom";
import { createRoot } from "react-dom/client";

import { KeptApp } from "@/KeptApp";
import { createLocalAnvilChain } from "@/chain/local-anvil-chain";
import { createMonadChain } from "@/chain/monad-chain";
import { diagnostics } from "@/lib/diagnostics";
import { readVaultConfig } from "@/vault/config";
import "@/styles.css";

window.addEventListener("error", (event) => {
  diagnostics.error("app.unhandled_error", event.error ?? new Error(event.message));
});
window.addEventListener("unhandledrejection", (event) => {
  diagnostics.error("app.unhandled_rejection", event.reason);
});

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID;
const localAnvilEnabled = import.meta.env.VITE_ENABLE_LOCAL_ANVIL === "true";
const vaultConfig = readVaultConfig(import.meta.env);
const keptChain = vaultConfig
  ? localAnvilEnabled
    ? createLocalAnvilChain(vaultConfig.rpcUrl)
    : createMonadChain(vaultConfig.rpcUrl)
  : null;

const root = document.getElementById("root");
if (!root) throw new Error("Missing root element");

if (!privyAppId) {
  root.textContent = "VITE_PRIVY_APP_ID is required to start Kept.";
} else {
  createRoot(root).render(
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ["email"],
        ...(keptChain
          ? {
              supportedChains: [keptChain],
              defaultChain: keptChain,
            }
          : {}),
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      <BrowserRouter>
        <KeptApp />
      </BrowserRouter>
    </PrivyProvider>,
  );
}
