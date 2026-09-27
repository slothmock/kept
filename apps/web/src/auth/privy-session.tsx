import {
  useLogin,
  usePrivy,
} from "@privy-io/react-auth";

import type { Session } from "./session.js";

export function usePrivySession(): Session {
  const {
    ready,
    authenticated,
    getAccessToken,
    logout,
    user,
  } = usePrivy();

  const { login } = useLogin();

  return {
    isReady: ready,
    isAuthenticated: authenticated,
    email:
      authenticated
        ? user?.email?.address ?? null
        : null,

    getAccessToken,

    login: async () => {
      await login();
    },

    logout: async () => {
      await logout();
    },
  };
}