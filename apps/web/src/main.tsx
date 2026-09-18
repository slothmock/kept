import { PrivyProvider } from "@privy-io/react-auth";
import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
} from "@solana/kit";
import { BrowserRouter } from "react-router-dom";
import { createRoot } from "react-dom/client";

import { App } from "./app.js";
import { localAnvilChain } from "./local-anvil-chain.js";
import { usePrivySession } from "./privy-session.js";
import "./styles.css";

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID;
const localAnvilEnabled = import.meta.env.VITE_ENABLE_LOCAL_ANVIL === "true";
function KeptApp() {
  const session = usePrivySession();

  return <App session={session} />;
}

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing root element");
}

if (!privyAppId) {
  root.textContent =
    "VITE_PRIVY_APP_ID is required to start Kept.";
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
          solana: {
            createOnLogin: "users-without-wallets",
          },
        },

        solana: {
          rpcs: {
            "solana:devnet": {
              rpc: createSolanaRpc(
                "https://api.devnet.solana.com",
              ),
              rpcSubscriptions:
                createSolanaRpcSubscriptions(
                  "wss://api.devnet.solana.com",
                ),
            },
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