import {
  PrivyClient,
  isEmbeddedWalletLinkedAccount,
  verifyAccessToken as privyVerifyAccessToken,
} from "@privy-io/node";

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
  readonly appSecret: string;
  readonly verificationKey: string;
  readonly verifyAccessToken?: PrivyAccessTokenVerifier;
}

export interface AuthenticatedWallet {
  readonly address: string;
}

export interface AuthenticatedIdentity {
  readonly privyUserId: string;
  readonly wallet: string | null;
}

export function createPrivyAuthenticator(
  options: PrivyAuthenticatorOptions,
) {
  const verificationKey = options.verificationKey
    .replace(/\\n/g, "\n")
    .trim();

  const verifyAccessToken =
    options.verifyAccessToken ?? privyVerifyAccessToken;

  const privy = new PrivyClient({
    appId: options.appId,
    appSecret: options.appSecret,
  });

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
      const verified = await verifyAccessToken({
        access_token: accessToken,
        app_id: options.appId,
        verification_key: verificationKey,
      });

      const user = await privy.users()._get(
        verified.user_id,
      );

      const wallet = user.linked_accounts.find(
        (account) =>
          isEmbeddedWalletLinkedAccount(account)
          && account.chain_type === "ethereum",
      );

      return {
        privyUserId: verified.user_id,
        wallet: wallet
          ? wallet.address
          : null,
      };
    } catch {
      return null;
    }
  };
}