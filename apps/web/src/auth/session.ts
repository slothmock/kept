export interface Session {
  readonly isReady: boolean;
  readonly isAuthenticated: boolean;
  readonly getAccessToken: () => Promise<string | null>;
  readonly login: () => Promise<void>;
  readonly logout: () => Promise<void>;
}