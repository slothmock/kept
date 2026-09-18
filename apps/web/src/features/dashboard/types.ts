import type { VaultPosition } from "../../vault/position.js";

export type DashboardPositionState =
  | { readonly kind: "unavailable" }
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly position: VaultPosition }
  | { readonly kind: "error"; readonly message: string };
