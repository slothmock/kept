export interface TransactionLock {
  readonly pending: boolean;
  run(operation: () => Promise<void>): Promise<boolean>;
}

export function createTransactionLock(): TransactionLock {
  let pending = false;

  return {
    get pending() {
      return pending;
    },

    async run(operation) {
      if (pending) return false;

      pending = true;
      try {
        await operation();
        return true;
      } finally {
        pending = false;
      }
    },
  };
}

export type VaultTransactionKind = "deposit" | "withdraw";

export interface VaultTransactionCoordinator {
  readonly pendingKind: VaultTransactionKind | null;
  run(kind: VaultTransactionKind, operation: () => Promise<void>): Promise<boolean>;
  subscribe(listener: () => void): () => void;
}

function createVaultTransactionCoordinator(): VaultTransactionCoordinator {
  let pendingKind: VaultTransactionKind | null = null;
  const listeners = new Set<() => void>();

  function notify() {
    for (const listener of listeners) listener();
  }

  return {
    get pendingKind() {
      return pendingKind;
    },

    async run(kind, operation) {
      if (pendingKind !== null) return false;

      pendingKind = kind;
      notify();
      try {
        await operation();
        return true;
      } finally {
        pendingKind = null;
        notify();
      }
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const vaultTransactionCoordinator = createVaultTransactionCoordinator();

export function getVaultTransactionCoordinator(): VaultTransactionCoordinator {
  return vaultTransactionCoordinator;
}
