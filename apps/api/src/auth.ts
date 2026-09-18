import { verifyAccessToken } from "@privy-io/node";

import type { AuthenticatedIdentity } from "./app.js";

interface PrivyAccessTokenVerifier {
  (input: {
    readonly access_token: string;
    readonly app_id: string;
    readonly verification_key: string;
  }): Promise<{
    readonly user_id: string;
  }>;
}

export interface PrivyAuthenticatorOptions {
  readonly appId: string;
  readonly verificationKey: string;
  readonly verifyAccessToken?: PrivyAccessTokenVerifier;
}

export function createPrivyAuthenticator(
  options: PrivyAuthenticatorOptions,
) {
  const verify =
    options.verifyAccessToken ?? verifyAccessToken;

  const verificationKey =
    options.verificationKey
      .replace(/\\n/g, "\n")
      .trim();

  return async (
    authorization: string | undefined,
  ): Promise<AuthenticatedIdentity | null> => {
    if (!authorization?.startsWith("Bearer ")) {
      return null;
    }

    const accessToken = authorization
      .slice("Bearer ".length)
      .trim();

    if (!accessToken) {
      return null;
    }

    try {
      const result = await verify({
        access_token: accessToken,
        app_id: options.appId,
        verification_key: verificationKey,
      });

      return {
        privyUserId: result.user_id,
      };
    } catch {
      return null;
    }
  };
}