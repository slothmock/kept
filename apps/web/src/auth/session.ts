export interface Session {
  readonly isReady: boolean;
  readonly isAuthenticated: boolean;
  readonly getAccessToken: () => Promise<string | null>;
  readonly login: () => void;
  readonly logout: () => void;
}