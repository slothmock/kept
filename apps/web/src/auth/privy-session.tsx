import { useLogin, usePrivy } from "@privy-io/react-auth";

import type { Session } from "./session.js";

export function usePrivySession(): Session {
  const {
    ready,
    authenticated,
    getAccessToken,
    logout,
  } = usePrivy();
  const { login } = useLogin();

  return {
    isReady: ready,
    isAuthenticated: authenticated,
    getAccessToken,
    login,
    logout,
  };
}