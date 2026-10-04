import type {
  MoonPayOfframpOrderStatus,
} from "@/api/kept-api";

export type BankWithdrawalPhase =
  | "setup"
  | "moonpay"
  | "waiting"
  | "review"
  | "sending"
  | "processing"
  | "complete"
  | "failed";

export interface BankWithdrawalTransferStore {
  readonly load: (
    orderId: string,
  ) => string | null;

  readonly save: (
    orderId: string,
    transferReference: string,
  ) => void;

  readonly clear: (
    orderId: string,
  ) => void;
}

interface BrowserStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_PREFIX =
  "kept:bank-withdrawal:transfer:";

export function createBankWithdrawalTransferStore(
  storage?: BrowserStorage,
): BankWithdrawalTransferStore {
  const memory =
    new Map<string, string>();

  const keyFor =
    (orderId: string) =>
      `${STORAGE_PREFIX}${orderId}`;

  return {
    load(orderId) {
      const remembered =
        memory.get(orderId);

      if (remembered) {
        return remembered;
      }

      if (!storage) {
        return null;
      }

      try {
        const persisted =
          storage.getItem(
            keyFor(orderId),
          );

        if (persisted) {
          memory.set(
            orderId,
            persisted,
          );
        }

        return persisted;
      } catch {
        return null;
      }
    },

    save(
      orderId,
      transferReference,
    ) {
      memory.set(
        orderId,
        transferReference,
      );

      if (!storage) {
        return;
      }

      try {
        storage.setItem(
          keyFor(orderId),
          transferReference,
        );
      } catch {
        // The in-memory copy still prevents a
        // duplicate send during this app session.
      }
    },

    clear(orderId) {
      memory.delete(orderId);

      if (!storage) {
        return;
      }

      try {
        storage.removeItem(
          keyFor(orderId),
        );
      } catch {
        // Nothing else to do.
      }
    },
  };
}

export async function deliverBankWithdrawal<T>(
  input: {
    readonly orderId: string;
    readonly store:
      BankWithdrawalTransferStore;
    readonly execute:
      () => Promise<{ readonly id: string }>;
    readonly acknowledge:
      (transferReference: string) => Promise<T>;
  },
): Promise<T> {
  let transferReference =
    input.store.load(
      input.orderId,
    );

  if (!transferReference) {
    const execution =
      await input.execute();

    transferReference =
      execution.id.trim();

    if (!transferReference) {
      throw new Error(
        "Withdrawal execution did not return a reference",
      );
    }

    input.store.save(
      input.orderId,
      transferReference,
    );
  }

  const result =
    await input.acknowledge(
      transferReference,
    );

  input.store.clear(
    input.orderId,
  );

  return result;
}

export function bankWithdrawalRefreshState(
  status: MoonPayOfframpOrderStatus,
): {
  readonly phase:
    BankWithdrawalPhase;
  readonly settled: boolean;
  readonly pollAfterMs:
    number | null;
} {
  if (status === "completed") {
    return {
      phase: "complete",
      settled: true,
      pollAfterMs: null,
    };
  }

  if (
    status === "failed"
    || status === "cancelled"
  ) {
    return {
      phase: "failed",
      settled: true,
      pollAfterMs: null,
    };
  }

  if (status === "funds_sent") {
    return {
      phase: "processing",
      settled: false,
      pollAfterMs: 10_000,
    };
  }

  return {
    phase: "waiting",
    settled: false,
    pollAfterMs: 2_000,
  };
}
