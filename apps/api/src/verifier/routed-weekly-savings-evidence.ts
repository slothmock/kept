import type { WeeklySavingsEvidenceSource, WeeklySavingsEvidence } from "./types.js";

export type SavingsEvidencePeriod = {
  readonly userId: string;
  readonly goalId: string;
  readonly startAt: Date;
  readonly endAt: Date;
};

/**
 * Only explicitly opened ledger accounts use provenance qualification.
 * An initialized account must NEVER fall back to legacy evidence when its
 * index or vault parity is unavailable: that could incorrectly grant rewards.
 */
export class RoutedWeeklySavingsEvidenceSource implements WeeklySavingsEvidenceSource {
  constructor(private readonly options: {
    readonly legacy: WeeklySavingsEvidenceSource;
    readonly ledger: WeeklySavingsEvidenceSource;
    readonly isLedgerInitialized: (userId: string) => Promise<boolean>;
    readonly assertLedgerEvidenceReady: (userId: string) => Promise<void>;
  }) {}

  async evaluatePeriod(input: SavingsEvidencePeriod): Promise<WeeklySavingsEvidence> {
    if (!(await this.options.isLedgerInitialized(input.userId))) {
      return this.options.legacy.evaluatePeriod(input);
    }
    await this.options.assertLedgerEvidenceReady(input.userId);
    return this.options.ledger.evaluatePeriod(input);
  }
}
