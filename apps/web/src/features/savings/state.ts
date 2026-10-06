import type {
  VaultPosition,
} from "@/features/savings/vault/position";

export type PositionState =
  | {
      readonly kind:
        "unavailable";
    }
  | {
      readonly kind:
        "loading";
    }
  | {
      readonly kind:
        "ready";

      readonly position:
        VaultPosition;
    }
  | {
      readonly kind:
        "error";

      readonly message:
        string;
    };

export type SavingsPerformanceState =
  | {
      readonly kind:
        "unavailable";
    }
  | {
      readonly kind:
        "loading";
    }
  | {
      readonly kind:
        "ready";

      readonly earningsAssets:
        bigint;
    }
  | {
      readonly kind:
        "synchronizing";

      readonly progressPercent:
        number | null;
    }
  | {
      readonly kind:
        "error";
    };

export type SavingsMarketStatusState =
  | {
      readonly kind:
        "unavailable";
    }
  | {
      readonly kind:
        "loading";
    }
  | {
      readonly kind:
        "ready";

      readonly availableToDepositAssets:
        bigint | null;

      readonly availableToWithdrawAssets:
        bigint;

      readonly tvlAssets:
        bigint;

      readonly suppliedAssets:
        bigint | null;

      readonly supplyCapAssets:
        bigint | null;

      readonly grossApyBps:
        number;

      readonly netApyBps:
        number;
    }
  | {
      readonly kind:
        "error";
    };
