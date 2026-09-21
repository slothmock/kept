import { PrivyProvider } from "@privy-io/react-auth";
import { BrowserRouter } from "react-router-dom";
import { createRoot } from "react-dom/client";

import { KeptApp } from "@/KeptApp";
import { localAnvilChain } from "@/chain/local-anvil-chain";
import "@/styles.css";

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID;
const localAnvilEnabled = import.meta.env.VITE_ENABLE_LOCAL_ANVIL === "true";

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
        ...(localAnvilEnabled
          ? {
              supportedChains: [localAnvilChain],
              defaultChain: localAnvilChain,
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
